import { useEffect, useCallback, useRef } from 'react'

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const REDIRECT_URI = 'http://127.0.0.1:5173/microsoft-callback'
const SCOPES = 'Tasks.ReadWrite offline_access'

interface MicrosoftAuthProps {
  clientId: string
  clientSecret: string
  onAuthorized: (refreshToken: string) => void
}

export function MicrosoftAuth({ clientId, clientSecret, onAuthorized }: MicrosoftAuthProps) {
  const onAuthorizedRef = useRef(onAuthorized)
  onAuthorizedRef.current = onAuthorized

  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== 'microsoft-callback' || !event.data.code) return

    try {
      const res = await fetch('/api/microsoft/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: event.data.code,
          clientId,
          clientSecret,
          redirectUri: REDIRECT_URI,
        }),
      })

      if (!res.ok) throw new Error('Token exchange failed')
      const data = await res.json()

      if (data.refresh_token) {
        onAuthorizedRef.current(data.refresh_token)
      }
    } catch (e) {
      console.error('Microsoft token exchange failed:', e)
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
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      response_mode: 'query',
    })

    const width = 500
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    window.open(
      `${MICROSOFT_AUTH_URL}?${params.toString()}`,
      'microsoft-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    )
  }

  return (
    <button
      onClick={openAuthPopup}
      className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-[#0078D4] text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
    >
      Authorize Microsoft To Do
    </button>
  )
}
