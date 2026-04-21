import { useState, useRef, useCallback, useEffect } from 'react'
import type { WidgetProps } from '../types'

interface NotesConfig {
  content?: string
  fontSize?: 'small' | 'medium' | 'large'
}

const FONT_SIZES = {
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-base',
}

function renderContent(text: string): string {
  // Simple markdown-lite rendering
  return text
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text*
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    // Unordered list items: - item or * item
    .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br />')
}

export function NotesWidget({ config, onConfigChange }: WidgetProps<NotesConfig>) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(config.content || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fontSize = config.fontSize || 'medium'

  // Sync draft with config when config changes externally
  useEffect(() => {
    if (!isEditing) {
      setDraft(config.content || '')
    }
  }, [config.content, isEditing])

  const startEditing = useCallback(() => {
    setIsEditing(true)
    setDraft(config.content || '')
    // Focus textarea after render
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [config.content])

  const handleChange = useCallback((value: string) => {
    setDraft(value)
    // Auto-save after 500ms of inactivity
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      onConfigChange({ content: value })
    }, 500)
  }, [onConfigChange])

  const finishEditing = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    onConfigChange({ content: draft })
    setIsEditing(false)
  }, [draft, onConfigChange])

  return (
    <div className="flex flex-col h-full px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">Notes</h3>
        {isEditing && (
          <button
            onClick={finishEditing}
            className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => handleChange(e.target.value)}
            onBlur={finishEditing}
            className={`w-full h-full bg-transparent text-[var(--foreground)] outline-none resize-none ${FONT_SIZES[fontSize]}`}
            placeholder="Tap to write a note..."
          />
        ) : (
          <div
            onClick={startEditing}
            className={`w-full h-full overflow-y-auto cursor-text ${FONT_SIZES[fontSize]} text-[var(--foreground)]`}
          >
            {config.content ? (
              <div
                className="whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: renderContent(config.content) }}
              />
            ) : (
              <p className="text-[var(--muted-foreground)] italic">Tap to write a note...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
