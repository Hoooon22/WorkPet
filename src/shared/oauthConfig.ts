// Google OAuth Desktop App credentials.
// Replace with values issued from GCP Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Desktop app.
// Both client_id and client_secret are bundled in the binary; per Google guidance for installed apps,
// client_secret is not actually secret — PKCE provides the security.
export const OAUTH_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? 'REPLACE_WITH_DESKTOP_CLIENT_ID'
export const OAUTH_CLIENT_SECRET =
  import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_SECRET ?? 'REPLACE_WITH_DESKTOP_CLIENT_SECRET'

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
]
