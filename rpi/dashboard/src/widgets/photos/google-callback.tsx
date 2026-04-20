import { useEffect } from 'react'

export function GoogleCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code && window.opener) {
      window.opener.postMessage({ type: 'google-callback', code }, '*')
    }
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="text-center">
        <h1 className="text-lg font-medium mb-2">Authorization Complete</h1>
        <p className="text-sm text-[var(--muted-foreground)]">You can close this window.</p>
      </div>
    </div>
  )
}
