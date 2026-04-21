export interface GoogleTask {
  id: string
  title: string
  status: 'needsAction' | 'completed'
}

export interface GoogleTaskList {
  id: string
  title: string
}

interface GoogleTasksConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  accessToken?: string
  tokenExpiry?: number
  taskListId?: string
}

async function getAccessToken(
  config: GoogleTasksConfig,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<string> {
  // Return cached token if still valid
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken
  }

  // Refresh via existing Google token endpoint
  const res = await fetch('/api/google/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
    }),
  })

  if (!res.ok) throw new Error('Google token refresh failed')
  const data = await res.json()

  if (!data.access_token) throw new Error('No access token in response')

  const expiry = Date.now() + (data.expires_in || 3600) * 1000
  onTokenUpdate(data.access_token, expiry)
  return data.access_token
}

async function tasksFetch(
  endpoint: string,
  config: GoogleTasksConfig,
  onTokenUpdate: (token: string, expiry: number) => void,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const token = await getAccessToken(config, onTokenUpdate)
  const url = `https://tasks.googleapis.com/tasks/v1${endpoint}`
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

export async function getGoogleTaskLists(
  config: GoogleTasksConfig,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<GoogleTaskList[]> {
  const res = await tasksFetch('/users/@me/lists', config, onTokenUpdate)
  if (!res.ok) throw new Error(`Google Tasks API error: ${res.status}`)
  const data = await res.json()
  return data.items || []
}

export async function getGoogleTasks(
  config: GoogleTasksConfig,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<GoogleTask[]> {
  const listId = config.taskListId || '@default'
  const res = await tasksFetch(
    `/lists/${listId}/tasks?showCompleted=false&maxResults=50`,
    config,
    onTokenUpdate
  )
  if (!res.ok) throw new Error(`Google Tasks API error: ${res.status}`)
  const data = await res.json()
  return (data.items || []).filter((t: GoogleTask) => t.title)
}

export async function addGoogleTask(
  config: GoogleTasksConfig,
  title: string,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<GoogleTask> {
  const listId = config.taskListId || '@default'
  const res = await tasksFetch(
    `/lists/${listId}/tasks`,
    config,
    onTokenUpdate,
    { method: 'POST', body: { title } }
  )
  if (!res.ok) throw new Error(`Google Tasks API error: ${res.status}`)
  return res.json()
}

export async function completeGoogleTask(
  config: GoogleTasksConfig,
  taskId: string,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<void> {
  const listId = config.taskListId || '@default'
  const res = await tasksFetch(
    `/lists/${listId}/tasks/${taskId}`,
    config,
    onTokenUpdate,
    { method: 'PATCH', body: { status: 'completed' } }
  )
  if (!res.ok) throw new Error(`Google Tasks API error: ${res.status}`)
}

export async function deleteGoogleTask(
  config: GoogleTasksConfig,
  taskId: string,
  onTokenUpdate: (token: string, expiry: number) => void
): Promise<void> {
  const listId = config.taskListId || '@default'
  const res = await tasksFetch(
    `/lists/${listId}/tasks/${taskId}`,
    config,
    onTokenUpdate,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error(`Google Tasks API error: ${res.status}`)
}
