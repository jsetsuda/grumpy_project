export interface MicrosoftTask {
  id: string
  title: string
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred'
}

export interface MicrosoftTaskList {
  id: string
  displayName: string
}

interface MicrosoftConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  accessToken?: string
  tokenExpiry?: number
  listId?: string
}

async function getAccessToken(
  config: MicrosoftConfig,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<string> {
  // Return cached token if still valid
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken
  }

  // Refresh the token
  const res = await fetch('/api/microsoft/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
    }),
  })

  if (!res.ok) throw new Error('Microsoft token refresh failed')
  const data = await res.json()

  if (!data.access_token) throw new Error('No access token in response')

  const expiry = Date.now() + (data.expires_in || 3600) * 1000
  onTokenUpdate(data.access_token, expiry)
  return data.access_token
}

async function graphFetch(
  endpoint: string,
  config: MicrosoftConfig,
  onTokenUpdate: (token: string, expiry: number) => void,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const token = await getAccessToken(config, onTokenUpdate)
  const url = `https://graph.microsoft.com/v1.0${endpoint}`
  const method = options.method || 'GET'

  const proxyUrl = `/api/ha-proxy?url=${encodeURIComponent(url)}`
  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }

  if (options.body) {
    fetchOptions.headers = {
      ...fetchOptions.headers as Record<string, string>,
      'Content-Type': 'application/json',
    }
    fetchOptions.body = JSON.stringify(options.body)
  }

  return fetch(proxyUrl, fetchOptions)
}

export async function getMicrosoftTaskLists(
  config: MicrosoftConfig,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<MicrosoftTaskList[]> {
  const res = await graphFetch('/me/todo/lists', config, onTokenUpdate)
  if (!res.ok) throw new Error(`Microsoft API error: ${res.status}`)
  const data = await res.json()
  return data.value
}

export async function getMicrosoftTasks(
  config: MicrosoftConfig,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<MicrosoftTask[]> {
  const listId = config.listId || 'defaultList'
  const res = await graphFetch(
    `/me/todo/lists/${listId}/tasks?$filter=status ne 'completed'&$top=50`,
    config,
    onTokenUpdate
  )
  if (!res.ok) throw new Error(`Microsoft API error: ${res.status}`)
  const data = await res.json()
  return data.value
}

export async function addMicrosoftTask(
  config: MicrosoftConfig,
  title: string,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<MicrosoftTask> {
  const listId = config.listId || 'defaultList'
  const res = await graphFetch(
    `/me/todo/lists/${listId}/tasks`,
    config,
    onTokenUpdate,
    { method: 'POST', body: { title } }
  )
  if (!res.ok) throw new Error(`Microsoft API error: ${res.status}`)
  return res.json()
}

export async function completeMicrosoftTask(
  config: MicrosoftConfig,
  taskId: string,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<void> {
  const listId = config.listId || 'defaultList'
  const res = await graphFetch(
    `/me/todo/lists/${listId}/tasks/${taskId}`,
    config,
    onTokenUpdate,
    { method: 'PATCH', body: { status: 'completed' } }
  )
  if (!res.ok) throw new Error(`Microsoft API error: ${res.status}`)
}

export async function deleteMicrosoftTask(
  config: MicrosoftConfig,
  taskId: string,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<void> {
  const listId = config.listId || 'defaultList'
  const res = await graphFetch(
    `/me/todo/lists/${listId}/tasks/${taskId}`,
    config,
    onTokenUpdate,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error(`Microsoft API error: ${res.status}`)
}
