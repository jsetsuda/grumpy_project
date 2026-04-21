import { useState, useCallback, useEffect, useRef } from 'react'
import { Plus, Check, Trash2, RefreshCw, AlertCircle } from 'lucide-react'
import type { WidgetProps } from '../types'
import {
  getTodoistTasks,
  addTodoistTask,
  completeTodoistTask,
  deleteTodoistTask,
} from './todoist-api'
import {
  getMicrosoftTasks,
  addMicrosoftTask,
  completeMicrosoftTask,
  deleteMicrosoftTask,
} from './microsoft-api'
import {
  getGoogleTasks,
  addGoogleTask,
  completeGoogleTask,
  deleteGoogleTask,
} from './google-tasks-api'

interface TodoItem {
  id: string
  text: string
  completed: boolean
}

interface TodoConfig {
  title: string
  provider: 'local' | 'todoist' | 'microsoft' | 'google'
  items?: TodoItem[]
  todoist?: { apiToken: string; projectId?: string }
  microsoft?: {
    clientId: string
    clientSecret: string
    refreshToken: string
    accessToken?: string
    tokenExpiry?: number
    listId?: string
  }
  google?: {
    clientId: string
    clientSecret: string
    refreshToken: string
    accessToken?: string
    tokenExpiry?: number
    taskListId?: string
  }
}

export function TodoWidget({ config, onConfigChange }: WidgetProps<TodoConfig>) {
  const [newText, setNewText] = useState('')
  const [remoteTasks, setRemoteTasks] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const provider = config.provider || 'local'

  const onConfigChangeRef = useRef(onConfigChange)
  onConfigChangeRef.current = onConfigChange
  const configRef = useRef(config)
  configRef.current = config

  const handleTokenUpdate = useCallback((token: string, expiry: number) => {
    if (provider === 'microsoft' && config.microsoft) {
      onConfigChangeRef.current({
        microsoft: { ...configRef.current.microsoft!, accessToken: token, tokenExpiry: expiry },
      })
    } else if (provider === 'google' && config.google) {
      onConfigChangeRef.current({
        google: { ...configRef.current.google!, accessToken: token, tokenExpiry: expiry },
      })
    }
  }, [provider, config.microsoft, config.google])

  const fetchRemoteTasks = useCallback(async () => {
    if (provider === 'local') return

    try {
      setLoading(true)
      setError(null)
      let tasks: TodoItem[] = []

      if (provider === 'todoist' && config.todoist?.apiToken) {
        const todoistTasks = await getTodoistTasks(config.todoist)
        tasks = todoistTasks.map(t => ({
          id: t.id,
          text: t.content,
          completed: t.is_completed,
        }))
      } else if (provider === 'microsoft' && config.microsoft?.refreshToken) {
        const msTasks = await getMicrosoftTasks(config.microsoft, handleTokenUpdate)
        tasks = msTasks.map(t => ({
          id: t.id,
          text: t.title,
          completed: t.status === 'completed',
        }))
      } else if (provider === 'google' && config.google?.refreshToken) {
        const gTasks = await getGoogleTasks(config.google, handleTokenUpdate)
        tasks = gTasks.map(t => ({
          id: t.id,
          text: t.title,
          completed: t.status === 'completed',
        }))
      }

      setRemoteTasks(tasks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch tasks')
    } finally {
      setLoading(false)
    }
  }, [provider, config.todoist, config.microsoft, config.google, handleTokenUpdate])

  // Fetch remote tasks on mount and every 60s
  useEffect(() => {
    if (provider === 'local') return

    fetchRemoteTasks()
    intervalRef.current = setInterval(fetchRemoteTasks, 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [provider, fetchRemoteTasks])

  const items: TodoItem[] = provider === 'local' ? (config.items || []) : remoteTasks

  // --- Local provider actions ---
  const addItemLocal = useCallback(() => {
    if (!newText.trim()) return
    const newItem: TodoItem = {
      id: Date.now().toString(36),
      text: newText.trim(),
      completed: false,
    }
    onConfigChange({ items: [...(config.items || []), newItem] })
    setNewText('')
  }, [newText, config.items, onConfigChange])

  const toggleItemLocal = useCallback((id: string) => {
    onConfigChange({
      items: (config.items || []).map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      ),
    })
  }, [config.items, onConfigChange])

  const removeItemLocal = useCallback((id: string) => {
    onConfigChange({ items: (config.items || []).filter(item => item.id !== id) })
  }, [config.items, onConfigChange])

  // --- Remote provider actions ---
  const addItemRemote = useCallback(async () => {
    if (!newText.trim()) return
    const text = newText.trim()
    setNewText('')
    setActionInProgress('add')

    try {
      if (provider === 'todoist' && config.todoist) {
        await addTodoistTask(config.todoist, text)
      } else if (provider === 'microsoft' && config.microsoft) {
        await addMicrosoftTask(config.microsoft, text, handleTokenUpdate)
      } else if (provider === 'google' && config.google) {
        await addGoogleTask(config.google, text, handleTokenUpdate)
      }
      await fetchRemoteTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add task')
    } finally {
      setActionInProgress(null)
    }
  }, [newText, provider, config.todoist, config.microsoft, config.google, handleTokenUpdate, fetchRemoteTasks])

  const toggleItemRemote = useCallback(async (id: string) => {
    setActionInProgress(id)
    try {
      if (provider === 'todoist' && config.todoist) {
        await completeTodoistTask(config.todoist.apiToken, id)
      } else if (provider === 'microsoft' && config.microsoft) {
        await completeMicrosoftTask(config.microsoft, id, handleTokenUpdate)
      } else if (provider === 'google' && config.google) {
        await completeGoogleTask(config.google, id, handleTokenUpdate)
      }
      // Remove from local state immediately for responsiveness
      setRemoteTasks(prev => prev.filter(t => t.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete task')
    } finally {
      setActionInProgress(null)
    }
  }, [provider, config.todoist, config.microsoft, config.google, handleTokenUpdate])

  const removeItemRemote = useCallback(async (id: string) => {
    setActionInProgress(id)
    try {
      if (provider === 'todoist' && config.todoist) {
        await deleteTodoistTask(config.todoist.apiToken, id)
      } else if (provider === 'microsoft' && config.microsoft) {
        await deleteMicrosoftTask(config.microsoft, id, handleTokenUpdate)
      } else if (provider === 'google' && config.google) {
        await deleteGoogleTask(config.google, id, handleTokenUpdate)
      }
      setRemoteTasks(prev => prev.filter(t => t.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task')
    } finally {
      setActionInProgress(null)
    }
  }, [provider, config.todoist, config.microsoft, config.google, handleTokenUpdate])

  const addItem = provider === 'local' ? addItemLocal : addItemRemote
  const toggleItem = provider === 'local' ? toggleItemLocal : toggleItemRemote
  const removeItem = provider === 'local' ? removeItemLocal : removeItemRemote

  const isConfigured =
    provider === 'local' ||
    (provider === 'todoist' && config.todoist?.apiToken) ||
    (provider === 'microsoft' && config.microsoft?.refreshToken) ||
    (provider === 'google' && config.google?.refreshToken)

  return (
    <div className="flex flex-col h-full px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">
          {config.title || 'To Do'}
        </h3>
        {provider !== 'local' && (
          <div className="flex items-center gap-1">
            {loading && (
              <RefreshCw size={12} className="text-[var(--muted-foreground)] animate-spin" />
            )}
            {error && (
              <button
                onClick={() => setError(null)}
                className="text-[var(--destructive)]"
              >
                <AlertCircle size={12} />
              </button>
            )}
            {!loading && (
              <button
                onClick={fetchRemoteTasks}
                className="p-1 rounded hover:bg-[var(--muted)] transition-colors"
                title="Refresh"
              >
                <RefreshCw size={12} className="text-[var(--muted-foreground)]" />
              </button>
            )}
          </div>
        )}
      </div>

      {!isConfigured ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-[var(--muted-foreground)] text-center">
            Configure {provider} in widget settings
          </p>
        </div>
      ) : (
        <>
          {/* Add item */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Add a task..."
              className="flex-1 bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)]"
              disabled={actionInProgress === 'add'}
            />
            <button
              onClick={addItem}
              disabled={actionInProgress === 'add'}
              className="p-2 rounded-md bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'add' ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
            </button>
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {items.map(item => (
              <div
                key={item.id}
                className={`flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-[var(--muted)] transition-colors ${
                  actionInProgress === item.id ? 'opacity-50' : ''
                }`}
              >
                <button
                  onClick={() => toggleItem(item.id)}
                  disabled={actionInProgress === item.id}
                  className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    item.completed
                      ? 'bg-[var(--primary)] border-[var(--primary)]'
                      : 'border-[var(--muted-foreground)]'
                  }`}
                >
                  {item.completed && <Check size={12} className="text-[var(--primary-foreground)]" />}
                </button>
                <span className={`flex-1 text-sm ${item.completed ? 'line-through text-[var(--muted-foreground)]' : ''}`}>
                  {item.text}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  disabled={actionInProgress === item.id}
                  className="opacity-0 group-hover:opacity-100 p-1 transition-opacity text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {items.length === 0 && !loading && (
              <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
                No tasks
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
