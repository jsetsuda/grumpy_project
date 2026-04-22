import { useEffect, useState } from 'react'

// Module-level guard so React StrictMode's double-mount in dev can't
// post the same code twice (which would cause the opener's second
// token-exchange to fail with Spotify's invalid_grant — codes are
// single-use).
let codeDispatched = false

export function SpotifyCallback() {
  const [status, setStatus] = useState<'pending' | 'sent' | 'no-opener' | 'no-code' | 'error'>('pending')
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const err = params.get('error')

    if (err) {
      setStatus('error')
      setErrorMsg(err)
      return
    }

    if (!code) {
      setStatus('no-code')
      return
    }

    if (!window.opener) {
      setStatus('no-opener')
      return
    }

    if (codeDispatched) {
      // StrictMode remount — the first mount already posted. Just
      // show the done state and close.
      setStatus('sent')
      const t = setTimeout(() => window.close(), 400)
      return () => clearTimeout(t)
    }

    codeDispatched = true
    window.opener.postMessage({ type: 'spotify-callback', code }, '*')
    setStatus('sent')
    // Give the opener a moment to process, then close the popup.
    const timer = setTimeout(() => window.close(), 800)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="text-center">
        {status === 'sent' && (
          <>
            <h1 className="text-lg font-medium mb-2">✓ Authorization Complete</h1>
            <p className="text-sm text-[var(--muted-foreground)]">This window will close automatically.</p>
          </>
        )}
        {status === 'pending' && <p>Completing authorization…</p>}
        {status === 'error' && (
          <>
            <h1 className="text-lg font-medium mb-2 text-red-400">Authorization failed</h1>
            <p className="text-sm text-[var(--muted-foreground)]">{errorMsg}</p>
          </>
        )}
        {status === 'no-code' && (
          <>
            <h1 className="text-lg font-medium mb-2 text-red-400">No authorization code</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Spotify didn't return a code. Try again.</p>
          </>
        )}
        {status === 'no-opener' && (
          <>
            <h1 className="text-lg font-medium mb-2 text-yellow-400">Couldn't reach the opener window</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Close this and try again, keeping the original tab open.</p>
          </>
        )}
      </div>
    </div>
  )
}
