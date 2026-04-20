import { useState, useCallback } from 'react'
import { Plus, Check, Trash2 } from 'lucide-react'
import type { WidgetProps } from '../types'

interface TodoItem {
  id: string
  text: string
  completed: boolean
}

interface TodoConfig {
  title: string
  items?: TodoItem[]
}

export function TodoWidget({ config, onConfigChange }: WidgetProps<TodoConfig>) {
  const [newText, setNewText] = useState('')
  const items: TodoItem[] = config.items || []

  const addItem = useCallback(() => {
    if (!newText.trim()) return
    const newItem: TodoItem = {
      id: Date.now().toString(36),
      text: newText.trim(),
      completed: false,
    }
    onConfigChange({ items: [...items, newItem] })
    setNewText('')
  }, [newText, items, onConfigChange])

  const toggleItem = useCallback((id: string) => {
    onConfigChange({
      items: items.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      ),
    })
  }, [items, onConfigChange])

  const removeItem = useCallback((id: string) => {
    onConfigChange({ items: items.filter(item => item.id !== id) })
  }, [items, onConfigChange])

  return (
    <div className="flex flex-col h-full px-4 py-3">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">
        {config.title || 'To Do'}
      </h3>

      {/* Add item */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Add a task..."
          className="flex-1 bg-[var(--muted)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)]"
        />
        <button
          onClick={addItem}
          className="p-2 rounded-md bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-[var(--muted)] transition-colors"
          >
            <button
              onClick={() => toggleItem(item.id)}
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
              className="opacity-0 group-hover:opacity-100 p-1 transition-opacity text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
