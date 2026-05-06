use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

#[derive(Default)]
struct TrayState {
    signed_in_email: Mutex<Option<String>>,
}

// ─────────────────────────────────────────────────────────────────────────
// Cursor command (already used by App.tsx)
// ─────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_cursor_position(app: tauri::AppHandle) -> Option<(f64, f64)> {
    app.cursor_position().ok().map(|p| (p.x, p.y))
}

// ─────────────────────────────────────────────────────────────────────────
// OAuth (Google) — Loopback + PKCE
// ─────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct OauthResult {
    access_token: String,
    refresh_token: Option<String>,
    expires_at_ms: i64,
    email: Option<String>,
}

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

#[derive(Deserialize)]
struct GoogleUserinfo {
    email: Option<String>,
}

fn random_code_verifier() -> String {
    let mut buf = [0u8; 48];
    rand::thread_rng().fill_bytes(&mut buf);
    general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

fn code_challenge_for(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    general_purpose::URL_SAFE_NO_PAD.encode(hasher.finalize())
}

const GOOGLE_AUTHORIZE: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO: &str = "https://openidconnect.googleapis.com/v1/userinfo";

#[tauri::command]
async fn oauth_google_signin(
    app: tauri::AppHandle,
    client_id: String,
    client_secret: String,
    scopes: Vec<String>,
) -> Result<OauthResult, String> {
    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| format!("loopback bind failed: {e}"))?;
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(sa) => sa.port(),
        _ => return Err("unsupported listen addr".into()),
    };
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let verifier = random_code_verifier();
    let challenge = code_challenge_for(&verifier);
    let state = random_code_verifier();

    let scope_str = scopes.join(" ");
    let auth_url = format!(
        "{GOOGLE_AUTHORIZE}?response_type=code&client_id={cid}&redirect_uri={redir}&scope={scope}&state={state}&code_challenge={chal}&code_challenge_method=S256&access_type=offline&prompt=consent&include_granted_scopes=true",
        cid = urlencoding::encode(&client_id),
        redir = urlencoding::encode(&redirect_uri),
        scope = urlencoding::encode(&scope_str),
        state = urlencoding::encode(&state),
        chal = urlencoding::encode(&challenge),
    );

    use tauri_plugin_shell::ShellExt;
    app.shell()
        .open(&auth_url, None)
        .map_err(|e| format!("failed to open browser: {e}"))?;

    let received_code: String = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let timeout = std::time::Instant::now() + Duration::from_secs(180);
        loop {
            if std::time::Instant::now() > timeout {
                return Err("oauth timeout".into());
            }
            match server.recv_timeout(Duration::from_secs(1)) {
                Ok(Some(req)) => {
                    let url = req.url().to_string();
                    let parsed = url::Url::parse(&format!("http://127.0.0.1{url}"))
                        .map_err(|e| format!("parse url: {e}"))?;
                    let params: HashMap<String, String> = parsed
                        .query_pairs()
                        .map(|(k, v)| (k.into_owned(), v.into_owned()))
                        .collect();

                    let body = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Work-Pet</title></head><body style=\"font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f7;color:#1f2937\"><div style=\"text-align:center\"><h2>로그인이 완료되었어요 ✨</h2><p>이 창은 닫으셔도 좋아요.</p></div></body></html>";
                    let resp = tiny_http::Response::from_string(body)
                        .with_header(
                            "Content-Type: text/html; charset=utf-8"
                                .parse::<tiny_http::Header>()
                                .unwrap(),
                        );
                    let _ = req.respond(resp);

                    if let Some(err) = params.get("error") {
                        return Err(format!("oauth error: {err}"));
                    }
                    if let Some(s) = params.get("state") {
                        if s != &state {
                            return Err("state mismatch".into());
                        }
                    }
                    if let Some(code) = params.get("code") {
                        return Ok(code.clone());
                    }
                }
                Ok(None) => continue,
                Err(e) => return Err(format!("recv: {e}")),
            }
        }
    })
    .await
    .map_err(|e| format!("join oauth task: {e}"))??;

    let token_form = [
        ("code", received_code.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier.as_str()),
    ];

    let body = serde_urlencoded::to_string(&token_form)
        .map_err(|e| format!("encode form: {e}"))?;

    let token_response = http_post_form(GOOGLE_TOKEN, &body).await?;
    let token: GoogleTokenResponse =
        serde_json::from_str(&token_response).map_err(|e| format!("parse token json: {e}; body={token_response}"))?;

    let expires_at_ms = chrono_now_ms() + token.expires_in * 1000;

    let email = fetch_user_email(&token.access_token).await.ok();

    Ok(OauthResult {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at_ms,
        email,
    })
}

#[tauri::command]
async fn oauth_google_refresh(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<OauthResult, String> {
    let form = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    let body = serde_urlencoded::to_string(&form).map_err(|e| format!("encode: {e}"))?;
    let resp = http_post_form(GOOGLE_TOKEN, &body).await?;
    let token: GoogleTokenResponse = serde_json::from_str(&resp)
        .map_err(|e| format!("parse refresh json: {e}; body={resp}"))?;
    let expires_at_ms = chrono_now_ms() + token.expires_in * 1000;
    Ok(OauthResult {
        access_token: token.access_token,
        refresh_token: Some(refresh_token),
        expires_at_ms,
        email: None,
    })
}

#[tauri::command]
async fn oauth_google_revoke(token: String) -> Result<(), String> {
    let url = format!("https://oauth2.googleapis.com/revoke?token={}", urlencoding::encode(&token));
    let _ = http_post_form(&url, "").await;
    Ok(())
}

async fn fetch_user_email(access_token: &str) -> Result<String, String> {
    let resp = http_get_with_bearer(GOOGLE_USERINFO, access_token).await?;
    let info: GoogleUserinfo =
        serde_json::from_str(&resp).map_err(|e| format!("parse userinfo: {e}"))?;
    info.email.ok_or_else(|| "no email".into())
}

fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Lightweight HTTP via std + tiny_http? — Use ureq via blocking thread for simplicity.
// Add ureq? — to avoid deps, use std + reqwest? — neither is added. We'll add ureq in Cargo.toml.
//
// For now, use spawn_blocking with std::net::TcpStream-based simple client? Too complex.
// Decision: bring in `ureq` synchronously via spawn_blocking.

async fn http_post_form(url: &str, body: &str) -> Result<String, String> {
    let url = url.to_string();
    let body = body.to_string();
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let resp = ureq::post(&url)
            .set("Content-Type", "application/x-www-form-urlencoded")
            .send_string(&body)
            .map_err(|e| format!("http: {e}"))?;
        let text = resp.into_string().map_err(|e| format!("body: {e}"))?;
        Ok(text)
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?
}

async fn http_get_with_bearer(url: &str, token: &str) -> Result<String, String> {
    let url = url.to_string();
    let token = token.to_string();
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let resp = ureq::get(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(|e| format!("http: {e}"))?;
        resp.into_string().map_err(|e| format!("body: {e}"))
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?
}

// ─────────────────────────────────────────────────────────────────────────
// Window management — panel / gacha / screenshot
// ─────────────────────────────────────────────────────────────────────────

const PANEL_WIDTH: u32 = 380;
const PANEL_HEIGHT: u32 = 540;

// Pet sprite sits centered in a 240x320 transparent window.
// Visible sprite is 120px wide → 60px of empty space on each side.
const PET_WINDOW_W: i32 = 240;
const PET_WINDOW_H: i32 = 320;
const PET_VISUAL_PAD_X: i32 = 60;

const GACHA_WIDTH: u32 = 520;
const GACHA_HEIGHT: u32 = 580;

#[tauri::command]
async fn open_panel(
    app: AppHandle,
    anchor_x: i32,
    anchor_y: i32,
) -> Result<(), String> {
    let (target_x, target_y) = panel_anchor_position(&app, anchor_x, anchor_y);

    if let Some(w) = app.get_webview_window("panel") {
        let _ = w.set_position(PhysicalPosition::new(target_x, target_y));
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, "panel", WebviewUrl::App("panel.html".into()))
        .title("Orbit Panel")
        .inner_size(PANEL_WIDTH as f64, PANEL_HEIGHT as f64)
        .position(target_x as f64, target_y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .accept_first_mouse(true)
        .build()
        .map_err(|e| format!("panel build: {e}"))?;
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

fn panel_anchor_position(app: &AppHandle, anchor_x: i32, anchor_y: i32) -> (i32, i32) {
    // Place panel next to the visible pet sprite, not the transparent window edges.
    let gap: i32 = 8;

    let monitor_size = app
        .get_webview_window("pet")
        .and_then(|w| w.primary_monitor().ok().flatten())
        .map(|m| m.size().clone())
        .unwrap_or(PhysicalSize::new(1920, 1080));

    let pet_visual_left = anchor_x + PET_VISUAL_PAD_X;
    let pet_visual_right = anchor_x + PET_WINDOW_W - PET_VISUAL_PAD_X;

    let want_right = pet_visual_right + gap;
    let target_x = if want_right + (PANEL_WIDTH as i32) > monitor_size.width as i32 {
        pet_visual_left - PANEL_WIDTH as i32 - gap
    } else {
        want_right
    };

    // Bottom-align panel with pet sprite bottom (= pet window bottom).
    let target_y = anchor_y + PET_WINDOW_H - PANEL_HEIGHT as i32;
    let clamped_y = target_y.max(0);

    (target_x.max(0), clamped_y)
}

#[tauri::command]
async fn close_panel(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("panel") {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
async fn panel_is_open(app: AppHandle) -> bool {
    app.get_webview_window("panel")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
async fn open_gacha(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("gacha") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let monitor = app
        .get_webview_window("pet")
        .and_then(|w| w.primary_monitor().ok().flatten());
    let (mx, my, mw, mh) = if let Some(m) = monitor {
        (
            m.position().x as f64,
            m.position().y as f64,
            m.size().width as f64,
            m.size().height as f64,
        )
    } else {
        (0.0, 0.0, 1920.0, 1080.0)
    };

    let center_x = mx + (mw - GACHA_WIDTH as f64) / 2.0;
    let center_y = my + (mh - GACHA_HEIGHT as f64) / 2.0;

    let win = WebviewWindowBuilder::new(&app, "gacha", WebviewUrl::App("gacha.html".into()))
        .title("Orbit Gacha")
        .inner_size(GACHA_WIDTH as f64, GACHA_HEIGHT as f64)
        .position(center_x, center_y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .accept_first_mouse(true)
        .build()
        .map_err(|e| format!("gacha build: {e}"))?;
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
async fn close_gacha(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("gacha") {
        let _ = w.close();
    }
    Ok(())
}

#[tauri::command]
async fn open_screenshot_overlay(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("screenshot").is_some() {
        return Ok(());
    }
    let monitor = app
        .get_webview_window("pet")
        .and_then(|w| w.primary_monitor().ok().flatten());
    let (mx, my, mw, mh) = if let Some(m) = monitor {
        (
            m.position().x as f64,
            m.position().y as f64,
            m.size().width as f64,
            m.size().height as f64,
        )
    } else {
        (0.0, 0.0, 1920.0, 1080.0)
    };

    let win = WebviewWindowBuilder::new(
        &app,
        "screenshot",
        WebviewUrl::App("screenshot.html".into()),
    )
    .title("Orbit Screenshot")
    .inner_size(mw, mh)
    .position(mx, my)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false)
    .accept_first_mouse(true)
    .build()
    .map_err(|e| format!("screenshot build: {e}"))?;
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
async fn close_screenshot_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("screenshot") {
        let _ = w.close();
    }
    Ok(())
}

#[tauri::command]
async fn capture_region(x: i32, y: i32, w: u32, h: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        use screenshots::Screen;
        let screens = Screen::all().map_err(|e| format!("screens: {e}"))?;
        let screen = screens
            .into_iter()
            .find(|s| {
                let info = &s.display_info;
                x >= info.x
                    && y >= info.y
                    && (x + w as i32) <= info.x + info.width as i32
                    && (y + h as i32) <= info.y + info.height as i32
            })
            .ok_or_else(|| "no matching screen for region".to_string())?;

        let local_x = x - screen.display_info.x;
        let local_y = y - screen.display_info.y;
        let img = screen
            .capture_area(local_x, local_y, w, h)
            .map_err(|e| format!("capture: {e}"))?;

        let mut buf = Cursor::new(Vec::new());
        let (width, height) = (img.width(), img.height());
        let raw = img.into_raw();
        let rgba = image::RgbaImage::from_raw(width, height, raw)
            .ok_or_else(|| "from_raw failed".to_string())?;
        image::DynamicImage::ImageRgba8(rgba)
            .write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| format!("encode png: {e}"))?;
        let b64 = general_purpose::STANDARD.encode(buf.into_inner());
        Ok(format!("data:image/png;base64,{b64}"))
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?
}

// ─────────────────────────────────────────────────────────────────────────
// App entry
// ─────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(TrayState::default())
        .invoke_handler(tauri::generate_handler![
            get_cursor_position,
            oauth_google_signin,
            oauth_google_refresh,
            oauth_google_revoke,
            open_panel,
            close_panel,
            panel_is_open,
            open_gacha,
            close_gacha,
            open_screenshot_overlay,
            close_screenshot_overlay,
            capture_region,
            set_auth_state
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            if let Some(window) = app.get_webview_window("pet") {
                position_default(&window);
            }
            build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn set_auth_state(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    signed_in: bool,
    email: Option<String>,
) -> Result<(), String> {
    if let Ok(mut guard) = state.signed_in_email.lock() {
        *guard = if signed_in { email } else { None };
    }
    let _ = refresh_tray_menu(&app);
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Window position helpers (existing)
// ─────────────────────────────────────────────────────────────────────────

fn ground_y(screen_height: u32, win_height: u32) -> i32 {
    let margin_bottom: i32 = 100;
    screen_height as i32 - win_height as i32 - margin_bottom
}

fn position_default(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let Ok(win_size) = window.outer_size() else {
        return;
    };
    let screen = monitor.size();
    let x = (screen.width as i32 - win_size.width as i32) / 2;
    let y = ground_y(screen.height, win_size.height);
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn position_bottom_right(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let Ok(win_size) = window.outer_size() else {
        return;
    };
    let screen = monitor.size();
    let margin_right: i32 = 24;
    let x = screen.width as i32 - win_size.width as i32 - margin_right;
    let y = ground_y(screen.height, win_size.height);
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

// ─────────────────────────────────────────────────────────────────────────
// Tray menu
// ─────────────────────────────────────────────────────────────────────────

const PET_OPTIONS: &[(&str, &str)] = &[
    ("pet:fox", "🦊 여우"),
    ("pet:frog", "🐸 개구리"),
    ("pet:penguin", "🐧 펭귄"),
    ("pet:turtle", "🐢 거북이"),
    ("pet:owl", "🦉 부엉이"),
    ("pet:octopus", "🐙 문어"),
    ("pet:chick", "🐥 병아리"),
    ("pet:bear", "🐻 곰"),
    ("pet:cat", "🐱 고양이"),
    ("pet:rabbit", "🐰 토끼"),
    ("pet:hedgehog", "🦔 고슴도치"),
    ("pet:raccoon", "🦝 너구리"),
    ("pet:unicorn", "🦄 유니콘"),
];

fn refresh_tray_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app)?;
    if let Some(tray) = app.tray_by_id("orbit-tray") {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

fn build_tray_menu(app: &AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let mut pet_builder = SubmenuBuilder::new(app, "펫 종류");
    for (id, label) in PET_OPTIONS {
        pet_builder = pet_builder.text(*id, *label);
    }
    let pet_submenu = pet_builder.build()?;

    let pause_item = CheckMenuItemBuilder::new("걷기 일시정지")
        .id("wander:toggle")
        .checked(false)
        .build(app)?;

    let hide_item = CheckMenuItemBuilder::new("펫 숨김")
        .id("window:toggle-hide")
        .checked(false)
        .build(app)?;

    let signed_in_email: Option<String> = app
        .state::<TrayState>()
        .signed_in_email
        .lock()
        .ok()
        .and_then(|g| g.clone());

    let auth_label = match &signed_in_email {
        Some(email) => format!("로그아웃 ({})", email),
        None => "로그인".into(),
    };
    let auth_item = MenuItemBuilder::new(auth_label).id("auth:toggle").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&pet_submenu)
        .separator()
        .item(&auth_item)
        .text("panel:open", "패널 열기")
        .text("gacha:open", "가챠 열기")
        .text("brief:fetch", "브리핑 새로고침")
        .separator()
        .item(&pause_item)
        .item(&hide_item)
        .separator()
        .text("pos:default", "기본 위치")
        .text("pos:bottom-right", "우하단으로")
        .separator()
        .text("quit", "종료")
        .build()?;

    Ok(menu)
}

fn build_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app.handle())?;

    let icon = app
        .default_window_icon()
        .ok_or("missing default window icon")?
        .clone();

    TrayIconBuilder::with_id("orbit-tray")
        .tooltip("Work-Pet: Orbit")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();

            if let Some(kind) = id.strip_prefix("pet:") {
                let _ = app.emit("orbit:pet-kind", kind.to_string());
                return;
            }

            match id {
                "quit" => {
                    app.exit(0);
                }
                "auth:toggle" => {
                    let _ = app.emit("orbit:auth-toggle", ());
                }
                "panel:open" => {
                    let _ = app.emit("orbit:open-panel", ());
                }
                "gacha:open" => {
                    let _ = app.emit("orbit:open-gacha", ());
                }
                "brief:fetch" => {
                    let _ = app.emit("orbit:fetch-now", ());
                }
                "wander:toggle" => {
                    let _ = app.emit("orbit:toggle-wander", ());
                }
                "window:toggle-hide" => {
                    if let Some(w) = app.get_webview_window("pet") {
                        let visible = w.is_visible().unwrap_or(true);
                        if visible {
                            let _ = w.hide();
                        } else {
                            let _ = w.show();
                        }
                    }
                }
                "pos:default" => {
                    if let Some(w) = app.get_webview_window("pet") {
                        position_default(&w);
                    }
                }
                "pos:bottom-right" => {
                    if let Some(w) = app.get_webview_window("pet") {
                        position_bottom_right(&w);
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
