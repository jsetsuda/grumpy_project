/**
 * Home Assistant Assist Pipeline protocol handler.
 * Uses raw WebSocket for binary audio support.
 */

export type PipelineEvent =
  | { type: 'run-start'; data: { pipeline: string; language: string; runner_data: { stt_binary_handler_id: number; timeout: number } } }
  | { type: 'stt-start'; data: Record<string, unknown> }
  | { type: 'stt-end'; data: { stt_output: { text: string } } }
  | { type: 'intent-start'; data: Record<string, unknown> }
  | { type: 'intent-end'; data: { intent_output: { response: { speech: { plain: { speech: string } } } } } }
  | { type: 'tts-start'; data: Record<string, unknown> }
  | { type: 'tts-end'; data: { tts_output: { url: string; mime_type: string } } }
  | { type: 'run-end'; data: Record<string, unknown> }
  | { type: 'error'; data: { code: string; message: string } }

export interface AssistCallbacks {
  onEvent: (event: PipelineEvent) => void
  onReady: (sendAudio: (samples: Int16Array) => void, endAudio: () => void) => void
  onError: (error: string) => void
  onClose: () => void
}

export interface AssistOptions {
  haUrl: string
  haToken: string
  pipelineId?: string
}

export function runAssistPipeline(options: AssistOptions, callbacks: AssistCallbacks): () => void {
  const { haUrl, haToken, pipelineId } = options
  let socket: WebSocket | null = null
  let msgId = 1
  let handlerId: number | null = null
  let pipelineMsgId: number | null = null
  let closed = false

  const wsUrl = haUrl.replace(/^http/, 'ws') + '/api/websocket'
  socket = new WebSocket(wsUrl)

  socket.binaryType = 'arraybuffer'

  socket.onopen = () => {
    // Wait for auth_required message
  }

  socket.onmessage = (event) => {
    if (closed) return

    if (typeof event.data === 'string') {
      const msg = JSON.parse(event.data)

      if (msg.type === 'auth_required') {
        socket?.send(JSON.stringify({ type: 'auth', access_token: haToken }))
      } else if (msg.type === 'auth_ok') {
        // Start the pipeline
        const id = msgId++
        pipelineMsgId = id
        const payload: Record<string, unknown> = {
          id,
          type: 'assist_pipeline/run',
          start_stage: 'stt',
          end_stage: 'tts',
          input: { sample_rate: 16000 },
        }
        if (pipelineId) {
          payload.pipeline = pipelineId
        }
        socket?.send(JSON.stringify(payload))
      } else if (msg.type === 'auth_invalid') {
        callbacks.onError('Invalid Home Assistant token')
        close()
      } else if (msg.type === 'event' && msg.id === pipelineMsgId) {
        const pipelineEvent = msg.event as PipelineEvent

        callbacks.onEvent(pipelineEvent)

        if (pipelineEvent.type === 'run-start') {
          handlerId = pipelineEvent.data.runner_data.stt_binary_handler_id
          callbacks.onReady(sendAudio, endAudio)
        } else if (pipelineEvent.type === 'error') {
          callbacks.onError(pipelineEvent.data.message)
        } else if (pipelineEvent.type === 'run-end') {
          close()
        }
      }
    }
  }

  socket.onerror = () => {
    if (!closed) {
      callbacks.onError('WebSocket connection failed')
      close()
    }
  }

  socket.onclose = () => {
    if (!closed) {
      closed = true
      callbacks.onClose()
    }
  }

  function sendAudio(samples: Int16Array) {
    if (closed || handlerId === null || !socket || socket.readyState !== WebSocket.OPEN) return

    // 1 byte handler ID + raw 16-bit PCM
    const buffer = new ArrayBuffer(1 + samples.byteLength)
    const view = new DataView(buffer)
    view.setUint8(0, handlerId)
    new Uint8Array(buffer, 1).set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
    socket.send(buffer)
  }

  function endAudio() {
    if (closed || handlerId === null || !socket || socket.readyState !== WebSocket.OPEN) return

    // Send just the handler ID byte to signal end
    const buffer = new ArrayBuffer(1)
    new DataView(buffer).setUint8(0, handlerId)
    socket.send(buffer)
  }

  function close() {
    if (closed) return
    closed = true
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close()
    }
    callbacks.onClose()
  }

  return close
}
