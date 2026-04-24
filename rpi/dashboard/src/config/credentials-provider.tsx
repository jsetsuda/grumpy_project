import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

/**
 * Shared credential context. Single source of truth for secrets that were
 * previously duplicated into every widget's config and persisted into the
 * dashboard JSON (which lives in git).
 *
 * Widgets read creds from here via useSharedCredentials(). At mount, if a
 * widget's local config happens to duplicate a shared cred value, the
 * widget scrubs its own config so the secret stops persisting.
 *
 * Source of truth is `credentials.json` on the server (already gitignored).
 * Edited from the Dashboard Manager page.
 */

export interface SharedCredentials {
  spotify?: {
    clientId: string
    clientSecret: string
    refreshToken: string
  }
  homeAssistant?: {
    url: string
    token: string
  }
  googleMaps?: { apiKey: string }
  youtube?: { apiKey: string }
  youtubeOauth?: { clientId: string; clientSecret: string; refreshToken: string }
  /**
   * Per-device free-form key/value storage. Lives in shared credentials so
   * it stays gitignored alongside the rest. Useful for things like the
   * linux-voice-assistant ESPHome encryption key the user needs to paste
   * into HA when adding a new Pi.
   *
   * Shape: { [deviceId]: { [key]: value } }.
   */
  deviceConfigs?: Record<string, Record<string, string>>
  unifi?: {
    host: string
    username: string
    password: string
  }
  plex?: { serverUrl: string; token: string }
  jellyfin?: { serverUrl: string; apiKey: string }
  icloud?: { sharedAlbumUrl: string }
  google?: { clientId: string; clientSecret: string; refreshToken: string }
  calendar?: { sources: Array<Record<string, unknown>> }
  todoist?: { apiToken: string }
  microsoft?: { clientId: string; refreshToken: string }
  googleTasks?: { clientId: string; clientSecret: string; refreshToken: string }
}

interface CredentialsContextValue {
  credentials: SharedCredentials | null
  loading: boolean
  refresh: () => Promise<void>
}

const CredentialsContext = createContext<CredentialsContextValue>({
  credentials: null,
  loading: true,
  refresh: async () => {},
})

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<SharedCredentials | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/credentials')
      if (res.ok) {
        setCredentials(await res.json())
      } else {
        setCredentials({})
      }
    } catch {
      setCredentials({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Poll occasionally so edits in the manager tab propagate to the
    // dashboard tab without a page reload.
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [refresh])

  return (
    <CredentialsContext.Provider value={{ credentials, loading, refresh }}>
      {children}
    </CredentialsContext.Provider>
  )
}

export function useSharedCredentials(): CredentialsContextValue {
  return useContext(CredentialsContext)
}
