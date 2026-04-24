import { Mic, MicOff, X } from 'lucide-react'
import { useVoiceAssistant } from '@/hooks/use-voice-assistant'
import { usePipelineEvents } from '@/hooks/use-pipeline-events'

interface VoiceOverlayProps {
  haUrl: string
  haToken: string
  pipelineId?: string
  satelliteEntity?: string
  showBackground?: boolean
  onInteraction?: () => void
}

export function VoiceOverlay({
  haUrl,
  haToken,
  pipelineId,
  satelliteEntity,
  showBackground = true,
  onInteraction,
}: VoiceOverlayProps) {
  const click = useVoiceAssistant({ haUrl, haToken, pipelineId })
  const satellite = usePipelineEvents({ haUrl, haToken, satelliteEntity })

  // If the local wyoming-satellite is actively doing something, let its
  // state drive the overlay. Otherwise fall back to the click-to-talk
  // state. Click-to-talk carries richer data (transcript/response), so it
  // remains the source of truth when it's active.
  const satelliteActive = satellite.state !== 'idle'
  const state = click.state !== 'idle' ? click.state : (satelliteActive ? satellite.state : 'idle')
  const transcript = click.transcript
  const response = click.response
  const error = click.error
  const startListening = click.startListening
  const stopListening = click.stopListening

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

  // Colors per state for the mic icon.
  const iconColor =
    state === 'error' ? 'text-red-400'
    : state === 'listening' ? 'text-blue-400'
    : state === 'processing' ? 'text-yellow-400'
    : 'text-green-400'

  const Glyph = state === 'error' ? MicOff : Mic

  // Active state: full-screen takeover. Big, readable from across the room
  // — the Echo Show presentation style. Dismissable via the X or tapping
  // outside the content column.
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 p-8 bg-black/70 backdrop-blur-md"
      style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
      onClick={handleCancel}
    >
      <button
        onClick={(e) => { e.stopPropagation(); handleCancel() }}
        className="absolute top-4 right-4 p-3 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        title="Cancel (or tap anywhere)"
        aria-label="Cancel"
      >
        <X size={28} />
      </button>

      {/* Big pulsing mic */}
      <div
        className="relative"
        onClick={(e) => { e.stopPropagation(); handleMicClick() }}
      >
        <div
          className={`absolute inset-0 rounded-full border-4 ${ringColor} ${
            state === 'listening' ? 'animate-pulse' : ''
          }`}
        />
        <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
          <Glyph size={56} className={iconColor} />
        </div>
      </div>

      {/* Status */}
      <div className="text-3xl sm:text-4xl font-medium text-white tracking-tight">{statusText}</div>

      {/* Transcript — what the user said (large, center-aligned) */}
      {transcript && (
        <div className="max-w-3xl w-full text-center">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-2">You said</div>
          <div className="text-2xl sm:text-3xl text-white/95 leading-snug">{transcript}</div>
        </div>
      )}

      {/* Response — what the assistant replied */}
      {response && (
        <div className="max-w-3xl w-full text-center">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Response</div>
          <div className="text-2xl sm:text-3xl text-white/90 leading-snug">{response}</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="max-w-3xl w-full text-center">
          <div className="text-xl text-red-300 leading-snug">{error}</div>
        </div>
      )}
    </div>
  )
}
