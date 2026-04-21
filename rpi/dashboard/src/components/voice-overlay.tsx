import { Mic, MicOff, X } from 'lucide-react'
import { useVoiceAssistant } from '@/hooks/use-voice-assistant'

interface VoiceOverlayProps {
  haUrl: string
  haToken: string
  pipelineId?: string
  showBackground?: boolean
  onInteraction?: () => void
}

export function VoiceOverlay({
  haUrl,
  haToken,
  pipelineId,
  showBackground = true,
  onInteraction,
}: VoiceOverlayProps) {
  const { state, transcript, response, error, startListening, stopListening } = useVoiceAssistant({
    haUrl,
    haToken,
    pipelineId,
  })

  const isActive = state !== 'idle'

  function handleMicClick() {
    onInteraction?.()
    if (state === 'idle') {
      startListening()
    } else if (state === 'listening') {
      stopListening()
    }
  }

  function handleCancel() {
    stopListening()
  }

  const ringColor = {
    idle: 'border-transparent',
    listening: 'border-blue-400',
    processing: 'border-yellow-400',
    responding: 'border-green-400',
    error: 'border-red-400',
  }[state]

  const statusText = {
    idle: '',
    listening: 'Listening...',
    processing: 'Processing...',
    responding: 'Done',
    error: 'Error',
  }[state]

  // Idle state: small floating mic button
  if (!isActive) {
    return (
      <button
        onClick={handleMicClick}
        className={`fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          showBackground ? 'bg-black/30 backdrop-blur' : 'bg-black/20'
        } hover:bg-black/40 active:scale-95`}
        title="Voice assistant"
      >
        <Mic size={20} className="text-white/80" />
      </button>
    )
  }

  // Active state: expanded card
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 w-[300px] rounded-2xl flex flex-col gap-3 px-4 py-4 transition-all ${
        showBackground ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/30'
      }`}
      style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
    >
      {/* Top row: mic icon with ring + status + cancel */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleMicClick}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            state === 'listening' ? 'bg-blue-500/20' : 'bg-white/10'
          }`}
        >
          {/* Pulsing ring */}
          <div
            className={`absolute inset-0 rounded-full border-2 ${ringColor} transition-colors ${
              state === 'listening' ? 'animate-pulse' : ''
            }`}
          />
          {state === 'error' ? (
            <MicOff size={20} className="text-red-400" />
          ) : (
            <Mic
              size={20}
              className={
                state === 'listening'
                  ? 'text-blue-400'
                  : state === 'processing'
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }
            />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white">{statusText}</div>
        </div>

        <button
          onClick={handleCancel}
          className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
          title="Cancel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Transcript */}
      {transcript && (
        <div className="text-sm text-white/90 leading-snug">
          <span className="text-xs text-white/50 block mb-0.5">You said:</span>
          {transcript}
        </div>
      )}

      {/* Response */}
      {response && (
        <div className="text-sm text-white leading-snug">
          <span className="text-xs text-white/50 block mb-0.5">Response:</span>
          {response}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-300 leading-snug">{error}</div>
      )}
    </div>
  )
}
