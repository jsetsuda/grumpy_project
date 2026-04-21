export interface TodoistTask {
  id: string
  content: string
  is_completed: boolean
  project_id: string
}

export interface TodoistProject {
  id: string
  name: string
}

interface TodoistConfig {
  apiToken: string
  projectId?: string
}

async function todoistFetch(
  endpoint: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const url = `https://api.todoist.com/rest/v2${endpoint}`
  const method = options.method || 'GET'

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
  }

  // Use ha-proxy to avoid CORS — it forwards Authorization header
  const proxyUrl = `/api/ha-proxy?url=${encodeURIComponent(url)}`

  const proxyOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }

  if (options.body) {
    proxyOptions.method = 'POST'
    proxyOptions.headers = {
      ...proxyOptions.headers as Record<string, string>,
      'Content-Type': 'application/json',
      'X-Original-Method': method,
    }
    proxyOptions.body = JSON.stringify(options.body)
  }

  return fetch(proxyUrl, proxyOptions)
}

export async function getTodoistTasks(config: TodoistConfig): Promise<TodoistTask[]> {
  const endpoint = config.projectId
    ? `/tasks?project_id=${config.projectId}`
    : '/tasks'
  const res = await todoistFetch(endpoint, config.apiToken)
  if (!res.ok) throw new Error(`Todoist API error: ${res.status}`)
  return res.json()
}

export async function getTodoistProjects(token: string): Promise<TodoistProject[]> {
  const res = await todoistFetch('/projects', token)
  if (!res.ok) throw new Error(`Todoist API error: ${res.status}`)
  return res.json()
}

export async function addTodoistTask(config: TodoistConfig, content: string): Promise<TodoistTask> {
  const body: Record<string, string> = { content }
  if (config.projectId) body.project_id = config.projectId
  const res = await todoistFetch('/tasks', config.apiToken, {
    method: 'POST',
    body,
  })
  if (!res.ok) throw new Error(`Todoist API error: ${res.status}`)
  return res.json()
}

export async function completeTodoistTask(token: string, taskId: string): Promise<void> {
  const res = await todoistFetch(`/tasks/${taskId}/close`, token, {
    method: 'POST',
    body: {},
  })
  if (!res.ok) throw new Error(`Todoist API error: ${res.status}`)
}

export async function deleteTodoistTask(token: string, taskId: string): Promise<void> {
  // DELETE via proxy — use ha-proxy with method override
  const url = `https://api.todoist.com/rest/v2/tasks/${taskId}`
  const res = await fetch(`/api/ha-proxy?url=${encodeURIComponent(url)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) throw new Error(`Todoist API error: ${res.status}`)
}
