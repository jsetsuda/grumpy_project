import { useState, useRef, useCallback } from 'react'
import { runAssistPipeline, type PipelineEvent } from '@/lib/ha-assist'
import { matchVoiceCommand } from '@/lib/voice-commands'
import { executeVoiceAction } from '@/lib/voice-command-actions'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'responding' | 'error'

interface UseVoiceAssistantProps {
  haUrl: string
  haToken: string
  pipelineId?: string
}

interface UseVoiceAssistantReturn {
  state: VoiceState
  transcript: string
  response: string
  error: string
  startListening: () => void
  stopListening: () => void
}

export function useVoiceAssistant({ haUrl, haToken, pipelineId }: UseVoiceAssistantProps): UseVoiceAssistantReturn {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')

  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const closePipelineRef = useRef<(() => void) | null>(null)
  const sendAudioRef = useRef<((samples: Int16Array) => void) | null>(null)
  const endAudioRef = useRef<(() => void) | null>(null)

  // Per-device conversation tracking. Reuse the id while the user is
  // actively conversing so "turn it off" can resolve "it" against the
  // previous turn. Expire after 60s of inactivity (new conversation).
  const conversationIdRef = useRef<string | null>(null)
  const conversationExpiresAtRef = useRef<number>(0)

  const acquireConversationId = useCallback((): string => {
    const now = Date.now()
    if (!conversationIdRef.current || now > conversationExpiresAtRef.current) {
      conversationIdRef.current = crypto.randomUUID()
    }
    conversationExpiresAtRef.current = now + 60_000
    return conversationIdRef.current
  }, [])

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    sendAudioRef.current = null
    endAudioRef.current = null
  }, [])

  const stopListening = useCallback(() => {
    // Signal end of audio to HA
    if (endAudioRef.current) {
      endAudioRef.current()
    }
    // Stop mic and audio processing
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    sendAudioRef.current = null
    endAudioRef.current = null
    // State transitions to processing (waiting for HA response)
    setState(prev => prev === 'listening' ? 'processing' : prev)
  }, [])

  const startListening = useCallback(async () => {
    if (!haUrl || !haToken) return

    // Reset state
    setTranscript('')
    setResponse('')
    setError('')
    setState('listening')

    // Clean up any previous session
    cleanup()
    if (closePipelineRef.current) {
      closePipelineRef.current()
      closePipelineRef.current = null
    }

    // Start the assist pipeline
    const closePipeline = runAssistPipeline(
      { haUrl, haToken, pipelineId, conversationId: acquireConversationId() },
      {
        onEvent: (event: PipelineEvent) => {
          switch (event.type) {
            case 'stt-end': {
              const sttText = event.data.stt_output.text
              setTranscript(sttText)
              const localMatch = matchVoiceCommand(sttText)
              if (localMatch) {
                executeVoiceAction(localMatch.action, localMatch.params)
                setResponse(localMatch.responseText)
                setState('responding')
                // Close the pipeline — we don't need HA's intent processing
                if (closePipelineRef.current) {
                  closePipelineRef.current()
                  closePipelineRef.current = null
                }
                setTimeout(() => setState('idle'), 3000)
              } else {
                setState('processing')
              }
              break
            }
            case 'intent-end': {
              const speech = event.data.intent_output?.response?.speech?.plain?.speech
              if (speech) {
                setResponse(speech)
              }
              setState('responding')
              break
            }
            case 'tts-end': {
              const ttsUrl = event.data.tts_output.url
              playTtsAudio(ttsUrl, haUrl, haToken)
              break
            }
            case 'run-end':
              // Auto-return to idle after a delay so user can read response
              setTimeout(() => setState('idle'), 3000)
              break
            case 'error':
              setError(event.data.message)
              setState('error')
              setTimeout(() => setState('idle'), 4000)
              break
          }
        },
        onReady: (sendAudio, endAudio) => {
          sendAudioRef.current = sendAudio
          endAudioRef.current = endAudio
          startMicrophone()
        },
        onError: (msg) => {
          setError(msg)
          setState('error')
          cleanup()
          setTimeout(() => setState('idle'), 4000)
        },
        onClose: () => {
          closePipelineRef.current = null
        },
      }
    )

    closePipelineRef.current = closePipeline

    async function startMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: { ideal: 16000 },
            channelCount: { exact: 1 },
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        streamRef.current = stream

        const audioContext = new AudioContext({ sampleRate: stream.getAudioTracks()[0].getSettings().sampleRate || 48000 })
        audioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        // ScriptProcessorNode: 4096 buffer, 1 input channel, 1 output channel
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        const sourceSampleRate = audioContext.sampleRate
        const targetSampleRate = 16000

        processor.onaudioprocess = (e) => {
          if (!sendAudioRef.current) return

          const inputData = e.inputBuffer.getChannelData(0)

          // Downsample if needed
          let samples: Float32Array
          if (Math.abs(sourceSampleRate - targetSampleRate) < 100) {
            samples = inputData
          } else {
            const ratio = sourceSampleRate / targetSampleRate
            const outputLength = Math.floor(inputData.length / ratio)
            samples = new Float32Array(outputLength)
            for (let i = 0; i < outputLength; i++) {
              samples[i] = inputData[Math.floor(i * ratio)]
            }
          }

          // Convert Float32 [-1, 1] to Int16
          const int16 = new Int16Array(samples.length)
          for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]))
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
          }

          sendAudioRef.current(int16)
        }

        source.connect(processor)
        processor.connect(audioContext.destination)
      } catch {
        setError('Microphone access denied')
        setState('error')
        if (closePipelineRef.current) {
          closePipelineRef.current()
          closePipelineRef.current = null
        }
        setTimeout(() => setState('idle'), 4000)
      }
    }
  }, [haUrl, haToken, pipelineId, cleanup, acquireConversationId])

  return { state, transcript, response, error, startListening, stopListening }
}

async function playTtsAudio(ttsUrl: string, haUrl: string, haToken: string) {
  try {
    // TTS URL may be relative
    const fullUrl = ttsUrl.startsWith('http') ? ttsUrl : `${haUrl}${ttsUrl}`

    // Route through the dashboard's HA proxy so an HTTPS page can fetch
    // audio from a plain http:// HA install without mixed-content blocking.
    const proxiedUrl = `/api/ha-proxy?url=${encodeURIComponent(fullUrl)}`

    const res = await fetch(proxiedUrl, {
      headers: { Authorization: `Bearer ${haToken}` },
    })
    if (!res.ok) return

    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const audio = new Audio(blobUrl)

    audio.onended = () => URL.revokeObjectURL(blobUrl)
    audio.onerror = () => URL.revokeObjectURL(blobUrl)

    await audio.play()
  } catch {
    // TTS playback is best-effort
  }
}
