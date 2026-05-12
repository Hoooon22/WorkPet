use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

struct TrayState {
    signed_in_email: Mutex<Option<String>>,
    dismissed: Mutex<bool>,
    wander_paused: Mutex<bool>,
    pet_size: Mutex<String>,
    panel_visible_before_capture: Mutex<bool>,
    color_picker_capture: Mutex<Option<ColorPickerCapture>>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            signed_in_email: Mutex::new(None),
            dismissed: Mutex::new(false),
            wander_paused: Mutex::new(false),
            pet_size: Mutex::new("medium".to_string()),
            panel_visible_before_capture: Mutex::new(false),
            color_picker_capture: Mutex::new(None),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ColorPickerCapture {
    data_url: String,
    physical_width: u32,
    physical_height: u32,
}

// ─────────────────────────────────────────────────────────────────────────
// Cursor command (already used by App.tsx)
// ─────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_cursor_position(app: tauri::AppHandle) -> Option<(f64, f64)> {
    app.cursor_position().ok().map(|p| (p.x, p.y))
}

// ─────────────────────────────────────────────────────────────────────────
// Frontmost app detection (for Today's Work Report).
// ─────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn frontmost_app_name_macos() -> Option<String> {
    use objc2_app_kit::NSWorkspace;

    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    let name = app.localizedName()?;
    Some(name.to_string())
}

#[tauri::command]
fn get_frontmost_app() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        frontmost_app_name_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

// ─────────────────────────────────────────────────────────────────────────
// System-wide idle detection (for away-from-desk pet behaviour).
// macOS: CGEventSourceSecondsSinceLastEventType reports seconds since the
//        last keyboard/mouse event from the HID system source.
// Windows: GetLastInputInfo returns the tick count of the last input; we
//          subtract from GetTickCount (wrapping handles 49.7-day overflow).
// ─────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(source: u32, event_type: u32) -> f64;
    fn CGEventSourceButtonState(source: u32, button: u32) -> u8;
}

#[cfg(target_os = "macos")]
fn idle_seconds_impl() -> f64 {
    // kCGEventSourceStateHIDSystemState = 1, kCGAnyInputEventType = 0xFFFFFFFF
    unsafe { CGEventSourceSecondsSinceLastEventType(1, 0xFFFFFFFF) }
}

#[cfg(target_os = "windows")]
fn idle_seconds_impl() -> f64 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    unsafe {
        if GetLastInputInfo(&mut info) == 0 {
            return 0.0;
        }
        let now = GetTickCount();
        now.wrapping_sub(info.dwTime) as f64 / 1000.0
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn idle_seconds_impl() -> f64 {
    0.0
}

#[tauri::command]
fn get_idle_seconds() -> f64 {
    idle_seconds_impl()
}

// ─────────────────────────────────────────────────────────────────────────
// Left mouse button physical state. Used by the pet drag to tell whether
// the user has actually released the mouse — `appWindow.startDragging()`
// gives no completion signal, and onMoved silence is unreliable because
// the user can pause mid-drag while still holding the button.
// macOS: CGEventSourceButtonState(HID, left).
// Windows: GetAsyncKeyState(VK_LBUTTON) high bit.
// ─────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn is_mouse_pressed_impl() -> bool {
    // kCGEventSourceStateHIDSystemState = 1, kCGMouseButtonLeft = 0
    unsafe { CGEventSourceButtonState(1, 0) != 0 }
}

#[cfg(target_os = "windows")]
fn is_mouse_pressed_impl() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    let state = unsafe { GetAsyncKeyState(VK_LBUTTON as i32) };
    (state as u16) & 0x8000 != 0
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn is_mouse_pressed_impl() -> bool {
    false
}

#[tauri::command]
fn is_mouse_pressed() -> bool {
    is_mouse_pressed_impl()
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
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
    id_token: Option<String>,
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
        id_token: token.id_token,
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
        id_token: token.id_token,
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
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .accept_first_mouse(true)
        .visible(false)
        .build()
        .map_err(|e| format!("panel build: {e}"))?;
    let _ = win.set_position(PhysicalPosition::new(target_x, target_y));
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

fn panel_anchor_position(app: &AppHandle, anchor_x: i32, anchor_y: i32) -> (i32, i32) {
    // anchor_x/anchor_y come from the JS side as physical pixels (outerPosition).
    // PANEL_WIDTH/HEIGHT and PET_WINDOW_W/H are logical pixels (used by the builder's inner_size).
    // Convert all logical constants to physical via the monitor's scale_factor before mixing.
    let monitor = app
        .get_webview_window("pet")
        .and_then(|w| w.primary_monitor().ok().flatten());
    let (monitor_w_phys, scale) = match monitor {
        Some(m) => (m.size().width as i32, m.scale_factor()),
        None => (1920, 1.0),
    };
    let to_phys = |v: i32| (v as f64 * scale) as i32;

    let gap = to_phys(8);
    let panel_w_phys = to_phys(PANEL_WIDTH as i32);
    let panel_h_phys = to_phys(PANEL_HEIGHT as i32);
    let pet_window_w_phys = to_phys(PET_WINDOW_W);
    let pet_window_h_phys = to_phys(PET_WINDOW_H);
    let pet_visual_pad_phys = to_phys(PET_VISUAL_PAD_X);

    let pet_visual_left = anchor_x + pet_visual_pad_phys;
    let pet_visual_right = anchor_x + pet_window_w_phys - pet_visual_pad_phys;

    let want_right = pet_visual_right + gap;
    let target_x = if want_right + panel_w_phys > monitor_w_phys {
        pet_visual_left - panel_w_phys - gap
    } else {
        want_right
    };

    let target_y = anchor_y + pet_window_h_phys - panel_h_phys;
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
    let (mx, my, mw, mh, scale) = if let Some(m) = monitor {
        (
            m.position().x,
            m.position().y,
            m.size().width as i32,
            m.size().height as i32,
            m.scale_factor(),
        )
    } else {
        (0, 0, 1920, 1080, 1.0)
    };

    let gacha_w_phys = (GACHA_WIDTH as f64 * scale) as i32;
    let gacha_h_phys = (GACHA_HEIGHT as f64 * scale) as i32;

    let center_x = mx + (mw - gacha_w_phys) / 2;
    let center_y = my + (mh - gacha_h_phys) / 2;

    let win = WebviewWindowBuilder::new(&app, "gacha", WebviewUrl::App("gacha.html".into()))
        .title("Orbit Gacha")
        .inner_size(GACHA_WIDTH as f64, GACHA_HEIGHT as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .accept_first_mouse(true)
        .visible(false)
        .build()
        .map_err(|e| format!("gacha build: {e}"))?;
    let _ = win.set_position(PhysicalPosition::new(center_x, center_y));
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

const TEAM_ROOM_WIDTH: u32 = 900;
const TEAM_ROOM_HEIGHT: u32 = 560;

const PROFILE_WIDTH: u32 = 720;
const PROFILE_HEIGHT: u32 = 500;

#[tauri::command]
async fn open_profile(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("profile") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(
        &app,
        "profile",
        WebviewUrl::App("profile.html".into()),
    )
    .title("프로필 & 메모리")
    .inner_size(PROFILE_WIDTH as f64, PROFILE_HEIGHT as f64)
    .min_inner_size(560.0, 360.0)
    .decorations(false)
    .transparent(false)
    .always_on_top(false)
    .resizable(true)
    .accept_first_mouse(true)
    .visible(true)
    .build()
    .map_err(|e| format!("profile build: {e}"))?;
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
async fn open_team_room(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("team_room") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(
        &app,
        "team_room",
        WebviewUrl::App("team_room.html".into()),
    )
    .title("팀 펫 룸")
    .inner_size(TEAM_ROOM_WIDTH as f64, TEAM_ROOM_HEIGHT as f64)
    .min_inner_size(560.0, 360.0)
    .decorations(false)
    .transparent(false)
    .always_on_top(false)
    .resizable(true)
    .accept_first_mouse(true)
    .visible(true)
    .build()
    .map_err(|e| format!("team_room build: {e}"))?;
    let _ = win.set_focus();
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
    let (mx, my, mw, mh, scale) = if let Some(m) = monitor {
        (
            m.position().x,
            m.position().y,
            m.size().width as f64,
            m.size().height as f64,
            m.scale_factor(),
        )
    } else {
        (0, 0, 1920.0, 1080.0, 1.0)
    };

    // inner_size() expects logical pixels; convert from monitor's physical size.
    let logical_w = mw / scale;
    let logical_h = mh / scale;

    let win = WebviewWindowBuilder::new(
        &app,
        "screenshot",
        WebviewUrl::App("screenshot.html".into()),
    )
    .title("Orbit Screenshot")
    .inner_size(logical_w, logical_h)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false)
    .accept_first_mouse(true)
    .visible(false)
    .build()
    .map_err(|e| format!("screenshot build: {e}"))?;

    // Remember panel visibility, then hide pet & panel so they don't appear
    // in the capture or block the overlay.
    let state = app.state::<TrayState>();
    let panel_was_visible = app
        .get_webview_window("panel")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if let Ok(mut g) = state.panel_visible_before_capture.lock() {
        *g = panel_was_visible;
    }
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = pet.hide();
    }
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }

    let _ = win.set_position(PhysicalPosition::new(mx, my));
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
async fn close_screenshot_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("screenshot") {
        let _ = w.close();
    }

    let state = app.state::<TrayState>();
    let dismissed = state.dismissed.lock().ok().map(|g| *g).unwrap_or(false);
    if !dismissed {
        if let Some(pet) = app.get_webview_window("pet") {
            let _ = pet.show();
        }
    }
    let panel_was_visible = state
        .panel_visible_before_capture
        .lock()
        .ok()
        .map(|g| *g)
        .unwrap_or(false);
    if panel_was_visible {
        if let Some(panel) = app.get_webview_window("panel") {
            let _ = panel.show();
        }
    }
    Ok(())
}

#[tauri::command]
async fn open_color_picker_overlay(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("color-picker").is_some() {
        return Ok(());
    }
    let monitor = app
        .get_webview_window("pet")
        .and_then(|w| w.primary_monitor().ok().flatten());
    let (mx, my, mw, mh, scale) = if let Some(m) = monitor {
        (
            m.position().x,
            m.position().y,
            m.size().width as f64,
            m.size().height as f64,
            m.scale_factor(),
        )
    } else {
        (0, 0, 1920.0, 1080.0, 1.0)
    };

    let logical_w = mw / scale;
    let logical_h = mh / scale;

    // Capture the primary screen *before* the overlay shows so the magnifier
    // can render the actual desktop pixels (not the dimmed overlay tint).
    let capture_origin = (mx, my);
    let capture = tauri::async_runtime::spawn_blocking(move || -> Result<ColorPickerCapture, String> {
        use screenshots::Screen;
        let screens = Screen::all().map_err(|e| format!("screens: {e}"))?;
        let (ox, oy) = capture_origin;
        let screen = screens
            .iter()
            .find(|s| s.display_info.x == ox && s.display_info.y == oy)
            .or_else(|| screens.iter().find(|s| s.display_info.is_primary))
            .or_else(|| screens.first())
            .cloned()
            .ok_or_else(|| "no screens".to_string())?;
        let img = screen.capture().map_err(|e| format!("capture: {e}"))?;
        let (w, h) = (img.width(), img.height());
        let raw = img.into_raw();
        let rgba = image::RgbaImage::from_raw(w, h, raw)
            .ok_or_else(|| "from_raw failed".to_string())?;
        let mut buf = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(rgba)
            .write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| format!("encode png: {e}"))?;
        let b64 = general_purpose::STANDARD.encode(buf.into_inner());
        Ok(ColorPickerCapture {
            data_url: format!("data:image/png;base64,{b64}"),
            physical_width: w,
            physical_height: h,
        })
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?;

    if let Ok(cap) = capture {
        if let Some(state) = app.try_state::<TrayState>() {
            if let Ok(mut g) = state.color_picker_capture.lock() {
                *g = Some(cap);
            }
        }
    }

    let win = WebviewWindowBuilder::new(
        &app,
        "color-picker",
        WebviewUrl::App("screenshot.html".into()),
    )
    .title("Orbit Color Picker")
    .inner_size(logical_w, logical_h)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false)
    .accept_first_mouse(true)
    .visible(false)
    .build()
    .map_err(|e| format!("color picker build: {e}"))?;
    let _ = win.set_position(PhysicalPosition::new(mx, my));
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
async fn pick_pixel(x: i32, y: i32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        use screenshots::Screen;
        let screens = Screen::all().map_err(|e| format!("screens: {e}"))?;
        let screen = screens
            .into_iter()
            .find(|s| {
                let info = &s.display_info;
                x >= info.x
                    && y >= info.y
                    && x < info.x + info.width as i32
                    && y < info.y + info.height as i32
            })
            .ok_or_else(|| "no matching screen for pixel".to_string())?;

        let local_x = x - screen.display_info.x;
        let local_y = y - screen.display_info.y;
        let img = screen
            .capture_area(local_x, local_y, 1, 1)
            .map_err(|e| format!("capture: {e}"))?;

        let raw = img.into_raw();
        if raw.len() < 3 {
            return Err("pixel data too short".into());
        }
        Ok(format!("#{:02X}{:02X}{:02X}", raw[0], raw[1], raw[2]))
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?
}

#[tauri::command]
fn take_color_picker_capture(state: tauri::State<'_, TrayState>) -> Option<ColorPickerCapture> {
    // Clone, do not `take` — under React StrictMode the frontend useEffect can
    // call this twice; the second call would otherwise see `None` and the
    // loupe canvas would never receive the capture (renders solid black).
    state.color_picker_capture.lock().ok().and_then(|g| g.clone())
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
// Reminder ticker — emits `orbit:reminder-tick` aligned to each minute boundary.
// Runs on a dedicated OS thread so webview throttling cannot delay reminders.
// ─────────────────────────────────────────────────────────────────────────

fn spawn_reminder_ticker(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let to_next = 60_000 - (now_ms % 60_000);
        std::thread::sleep(Duration::from_millis(to_next + 50));
        let _ = app.emit("orbit:reminder-tick", ());
    });
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(TrayState::default())
        .invoke_handler(tauri::generate_handler![
            get_cursor_position,
            get_frontmost_app,
            get_idle_seconds,
            is_mouse_pressed,
            oauth_google_signin,
            oauth_google_refresh,
            oauth_google_revoke,
            open_panel,
            close_panel,
            panel_is_open,
            open_gacha,
            close_gacha,
            open_team_room,
            open_profile,
            open_screenshot_overlay,
            close_screenshot_overlay,
            capture_region,
            open_color_picker_overlay,
            pick_pixel,
            take_color_picker_capture,
            set_auth_state,
            set_dismissed_state,
            set_wander_paused_state,
            set_pet_size_state,
            get_walk_area
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            if let Some(window) = app.get_webview_window("pet") {
                let _ = window.set_visible_on_all_workspaces(true);
                position_default(&window);
            }
            build_tray(app)?;
            spawn_reminder_ticker(&app.handle());
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

#[tauri::command]
fn set_dismissed_state(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    dismissed: bool,
) -> Result<(), String> {
    if let Ok(mut guard) = state.dismissed.lock() {
        *guard = dismissed;
    }
    let _ = refresh_tray_menu(&app);
    Ok(())
}

#[tauri::command]
fn set_wander_paused_state(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    paused: bool,
) -> Result<(), String> {
    if let Ok(mut guard) = state.wander_paused.lock() {
        *guard = paused;
    }
    let _ = refresh_tray_menu(&app);
    Ok(())
}

#[tauri::command]
fn set_pet_size_state(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    size: String,
) -> Result<(), String> {
    if !matches!(size.as_str(), "small" | "medium" | "large") {
        return Err(format!("invalid pet size: {size}"));
    }
    if let Ok(mut guard) = state.pet_size.lock() {
        *guard = size;
    }
    let _ = refresh_tray_menu(&app);
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Window position helpers (existing)
// ─────────────────────────────────────────────────────────────────────────

// Walk area = the rectangle (in physical pixels) where the pet may stand.
// macOS: full screen — pet sits at the absolute screen bottom.
// Windows: monitor work area — excludes the taskbar so pet sits just above it.
#[derive(Serialize)]
struct WalkArea {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

fn walk_area_for(window: &tauri::WebviewWindow) -> Option<WalkArea> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let pos = monitor.position();
    let size = monitor.size();
    let full = WalkArea {
        x: pos.x,
        y: pos.y,
        width: size.width as i32,
        height: size.height as i32,
    };

    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        let center = POINT {
            x: pos.x + (size.width as i32) / 2,
            y: pos.y + (size.height as i32) / 2,
        };
        let hmon = MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST);
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(hmon, &mut info) != 0 {
            let r = info.rcWork;
            return Some(WalkArea {
                x: r.left,
                y: r.top,
                width: r.right - r.left,
                height: r.bottom - r.top,
            });
        }
    }

    Some(full)
}

#[tauri::command]
fn get_walk_area(window: tauri::WebviewWindow) -> Result<WalkArea, String> {
    walk_area_for(&window).ok_or_else(|| "no monitor".to_string())
}

fn ground_y_from_walk_area(window: &tauri::WebviewWindow, win_height: u32) -> Option<i32> {
    let area = walk_area_for(window)?;
    Some(area.y + area.height - win_height as i32)
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
    let y = ground_y_from_walk_area(window, win_size.height)
        .unwrap_or_else(|| screen.height as i32 - win_size.height as i32);
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

// ─────────────────────────────────────────────────────────────────────────
// Tray menu
// ─────────────────────────────────────────────────────────────────────────

const PET_OPTIONS: &[(&str, &str)] = &[
    ("pet:pico", "🤖 피코"),
    ("pet:cat", "🐱 고양이"),
    ("pet:rabbit", "🐰 토끼"),
    ("pet:hedgehog", "🦔 고슴도치"),
    ("pet:raccoon", "🦝 너구리"),
    ("pet:unicorn", "🦄 유니콘"),
    ("pet:dog", "🐕 강아지"),
    ("pet:panda", "🐼 판다"),
    ("pet:lion", "🦁 사자"),
    ("pet:dragon", "🐉 드래곤"),
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

    let pet_size: String = app
        .state::<TrayState>()
        .pet_size
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_else(|| "medium".to_string());

    let size_small = CheckMenuItemBuilder::new("작게")
        .id("size:small")
        .checked(pet_size == "small")
        .build(app)?;
    let size_medium = CheckMenuItemBuilder::new("보통")
        .id("size:medium")
        .checked(pet_size == "medium")
        .build(app)?;
    let size_large = CheckMenuItemBuilder::new("크게")
        .id("size:large")
        .checked(pet_size == "large")
        .build(app)?;
    let size_submenu = SubmenuBuilder::new(app, "펫 크기")
        .item(&size_small)
        .item(&size_medium)
        .item(&size_large)
        .build()?;

    let signed_in_email: Option<String> = app
        .state::<TrayState>()
        .signed_in_email
        .lock()
        .ok()
        .and_then(|g| g.clone());

    let dismissed: bool = app
        .state::<TrayState>()
        .dismissed
        .lock()
        .ok()
        .map(|g| *g)
        .unwrap_or(false);

    let wander_paused: bool = app
        .state::<TrayState>()
        .wander_paused
        .lock()
        .ok()
        .map(|g| *g)
        .unwrap_or(false);

    let pause_item = CheckMenuItemBuilder::new("재우기")
        .id("wander:toggle")
        .checked(wander_paused)
        .build(app)?;

    let auth_label = match &signed_in_email {
        Some(email) => format!("로그아웃 ({})", email),
        None => "로그인".into(),
    };
    let auth_item = MenuItemBuilder::new(auth_label).id("auth:toggle").build(app)?;

    let dismiss_label = if dismissed { "🐾 펫 소환" } else { "💤 펫 퇴장" };
    let dismiss_item = MenuItemBuilder::new(dismiss_label)
        .id("dismiss:toggle")
        .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&pet_submenu)
        .item(&size_submenu)
        .separator()
        .item(&auth_item)
        .text("panel:open", "패널 열기")
        .text("gacha:open", "가챠 열기")
        .text("brief:fetch", "브리핑 새로고침")
        .separator()
        .text("profile:open", "프로필 설정")
        .text("memory:clear", "메모리 비우기")
        .separator()
        .item(&pause_item)
        .item(&dismiss_item)
        .separator()
        .text("pos:default", "기본 위치")
        .text("pos:bottom-right", "우하단으로")
        .separator()
        .text("update:check", "업데이트 확인")
        .text("quit", "종료")
        .build()?;

    Ok(menu)
}

fn build_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app.handle())?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon@2x.png"))?;

    TrayIconBuilder::with_id("orbit-tray")
        .tooltip("Work-Pet: Orbit")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();

            if let Some(kind) = id.strip_prefix("pet:") {
                let _ = app.emit("orbit:pet-kind", kind.to_string());
                return;
            }

            if let Some(size) = id.strip_prefix("size:") {
                let _ = app.emit("orbit:pet-size", size.to_string());
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
                "profile:open" => {
                    let _ = app.emit("orbit:open-profile", ());
                }
                "memory:clear" => {
                    let _ = app.emit("orbit:clear-memory", ());
                }
                "brief:fetch" => {
                    let _ = app.emit("orbit:fetch-now", ());
                }
                "wander:toggle" => {
                    let _ = app.emit("orbit:toggle-wander", ());
                }
                "dismiss:toggle" => {
                    let _ = app.emit("orbit:toggle-dismiss", ());
                }
                "pos:default" => {
                    if let Some(w) = app.get_webview_window("pet") {
                        position_default(&w);
                    }
                }
                "pos:bottom-right" => {
                    // Route through the same frontend handler the panel's
                    // "🏠 원위치" button uses, so position + pause stay in
                    // one code path. Rust-side teleport conflicts with the
                    // frontend's onMoved debounce and can leave the pet at
                    // the wrong spot.
                    let _ = app.emit(
                        "orbit:panel-action",
                        serde_json::json!({ "type": "return-home" }),
                    );
                }
                "update:check" => {
                    let _ = app.emit("orbit:check-update", ());
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
