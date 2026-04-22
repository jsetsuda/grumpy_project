import { useEffect, useCallback, useRef } from 'react'

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
// Derive at runtime so the redirect matches whichever origin the user is on
// (https://host:5173 in the deployed case, http://localhost:5173 for dev).
// Remember to register the same URL in the Spotify app's redirect URIs.
function getRedirectUri(): string {
  return `${window.location.origin}/spotify-callback`
}
const SCOPES = [
  'user-read-currently-playing',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-recently-played',
  'user-library-read',
  'user-read-email',
  'user-read-private',
  'streaming',
  'app-remote-control',
].join(' ')

interface SpotifyAuthProps {
  clientId: string
  clientSecret: string
  onAuthorized: (refreshToken: string) => void
}

// Codes that have already been handed to Spotify's token endpoint in this
// page load. Spotify rejects re-use with invalid_grant, so we dedupe
// defensively — the callback page's StrictMode guard is the primary
// protection, this is belt-and-suspenders for any future entry point.
const processedCodes = new Set<string>()

export function SpotifyAuth({ clientId, clientSecret, onAuthorized }: SpotifyAuthProps) {
  const onAuthorizedRef = useRef(onAuthorized)
  onAuthorizedRef.current = onAuthorized

  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== 'spotify-callback' || !event.data.code) return
    const code = event.data.code as string
    if (processedCodes.has(code)) return
    processedCodes.add(code)

    try {
      const res = await fetch('/api/spotify/token', {
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
        console.error('[spotify] token exchange failed:', data.error_description || data.error || res.status)
        alert(`Spotify authorization failed: ${data.error_description || data.error || 'unknown error'}`)
        return
      }
      if (data.refresh_token) {
        onAuthorizedRef.current(data.refresh_token)
      } else {
        console.error('[spotify] response had no refresh_token:', data)
        alert('Spotify returned no refresh token. Check that your app uses Authorization Code flow (not PKCE or Implicit).')
      }
    } catch (e) {
      console.error('[spotify] token exchange failed:', e)
      alert(`Spotify authorization failed: ${e instanceof Error ? e.message : 'network error'}`)
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
    })

    const width = 500
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    window.open(
      `${SPOTIFY_AUTH_URL}?${params.toString()}`,
      'spotify-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    )
  }

  return (
    <button
      onClick={openAuthPopup}
      className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-[#1DB954] text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
    >
      Authorize Spotify
    </button>
  )
}
