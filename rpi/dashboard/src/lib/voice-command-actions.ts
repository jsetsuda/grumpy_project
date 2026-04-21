type ActionHandler = (action: string, params: Record<string, string>) => Promise<boolean>

const handlers: ActionHandler[] = []

export function registerVoiceHandler(handler: ActionHandler): () => void {
  handlers.push(handler)
  return () => {
    const idx = handlers.indexOf(handler)
    if (idx >= 0) handlers.splice(idx, 1)
  }
}

export async function executeVoiceAction(action: string, params: Record<string, string>): Promise<boolean> {
  for (const handler of handlers) {
    try {
      const handled = await handler(action, params)
      if (handled) return true
    } catch {
      // Continue to next handler
    }
  }
  return false
}
