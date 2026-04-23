import { useEffect, useCallback, useRef } from 'react'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
// Derived at runtime so the redirect matches whichever origin the page is on.
// Must also be registered in Google Cloud Console → OAuth client → Authorized
// redirect URIs.
function getRedirectUri(): string {
  return `${window.location.origin}/google-callback`
}
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly'

interface YouTubeAuthProps {
  clientId: string
  clientSecret: string
  onAuthorized: (refreshToken: string) => void
}

// Dedupe against React StrictMode double-mount + any other path that might
// fire the same code twice (Google revokes reused auth codes).
const processedCodes = new Set<string>()

// A stable-ish device identifier that persists across reloads on the same
// browser (when storage is available) and otherwise falls back to a
// per-session UUID. Used to satisfy Google's device_id requirement for
// OAuth flows targeting a private-IP redirect.
function getOrCreateDeviceId(): string {
  const KEY = 'grumpy-oauth-device-id'
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    return crypto.randomUUID()
  }
}

export function YouTubeAuth({ clientId, clientSecret, onAuthorized }: YouTubeAuthProps) {
  const onAuthorizedRef = useRef(onAuthorized)
  onAuthorizedRef.current = onAuthorized

  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== 'google-callback' || !event.data.code) return
    const code = event.data.code as string
    if (processedCodes.has(code)) return
    processedCodes.add(code)

    try {
      const res = await fetch('/api/google/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          clientId,
          clientSecret,
          redirectUri: getRedirectUri(),
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        console.error('[youtube] token exchange failed:', data.error_description || data.error || res.status)
        alert(`YouTube authorization failed: ${data.error_description || data.error || 'unknown error'}`)
        return
      }
      if (data.refresh_token) {
        onAuthorizedRef.current(data.refresh_token)
      } else {
        console.error('[youtube] response had no refresh_token:', data)
        alert('Google returned no refresh token. Make sure access_type=offline and prompt=consent are set (they are by default here).')
      }
    } catch (e) {
      console.error('[youtube] token exchange failed:', e)
      alert(`YouTube authorization failed: ${e instanceof Error ? e.message : 'network error'}`)
    }
  }, [clientId, clientSecret])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  function openAuthPopup() {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: getRedirectUri(),
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      // Google requires device_id + device_name for OAuth requests whose
      // redirect_uri points at a private IP. Values are per-install
      // identifiers; they don't need to be registered anywhere.
      device_id: getOrCreateDeviceId(),
      device_name: 'Grumpy Dashboard',
    })

    const width = 500
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    window.open(
      `${GOOGLE_AUTH_URL}?${params.toString()}`,
      'youtube-auth',
      `width=${width},height=${height},left=${left},top=${top}`,
    )
  }

  return (
    <button
      onClick={openAuthPopup}
      className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-[#FF0000] text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
    >
      Authorize YouTube
    </button>
  )
}
