import { useState, useCallback } from 'react'
import { Search, Play, Video, Link } from 'lucide-react'
import type { WidgetProps } from '../types'

interface YouTubeConfig {
  apiKey?: string
  searchQuery?: string
  videoId?: string
  autoplay?: boolean
}

interface SearchResult {
  videoId: string
  title: string
  thumbnail: string
  channel: string
}

function extractVideoId(input: string): string | null {
  // Handle direct video IDs (11 chars)
  if (/^[\w-]{11}$/.test(input.trim())) {
    return input.trim()
  }
  // Handle full URLs
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ]
  for (const p of patterns) {
    const match = input.match(p)
    if (match) return match[1]
  }
  return null
}

export function YouTubeWidget({ config, onConfigChange }: WidgetProps<YouTubeConfig>) {
  const [searchQuery, setSearchQuery] = useState(config.searchQuery || '')
  const [urlInput, setUrlInput] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  const hasApiKey = !!config.apiKey

  const search = useCallback(async (query: string) => {
    if (!config.apiKey || !query.trim()) return
    setSearching(true)
    setError('')

    try {
      const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        q: query.trim(),
        key: config.apiKey,
        maxResults: '5',
      })
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(`https://www.googleapis.com/youtube/v3/search?${params}`)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()

      const items: SearchResult[] = (data.items || []).map((item: any) => ({
        videoId: item.id?.videoId || '',
        title: item.snippet?.title || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
        channel: item.snippet?.channelTitle || '',
      }))
      setResults(items)
    } catch {
      setError('Search failed. Check your API key.')
    } finally {
      setSearching(false)
    }
  }, [config.apiKey])

  const playVideo = useCallback((videoId: string) => {
    onConfigChange({ videoId })
    setResults([])
  }, [onConfigChange])

  const handleUrlSubmit = useCallback(() => {
    const vid = extractVideoId(urlInput)
    if (vid) {
      playVideo(vid)
      setUrlInput('')
      setError('')
    } else {
      setError('Could not extract video ID from URL')
    }
  }, [urlInput, playVideo])

  // If we have a video playing, show the player
  if (config.videoId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 relative bg-black rounded-lg overflow-hidden">
          <iframe
            src={`https://www.youtube.com/embed/${config.videoId}?autoplay=${config.autoplay !== false ? 1 : 0}&enablejsapi=1`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title="YouTube Player"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onConfigChange({ videoId: undefined })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-xs text-[var(--muted-foreground)] transition-colors min-h-[32px]"
          >
            <Search size={12} /> Back
          </button>
        </div>
      </div>
    )
  }

  // Search / input view
  return (
    <div className="flex flex-col h-full p-2 gap-3">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Video size={18} />
        <span className="text-sm font-medium">YouTube</span>
      </div>

      {/* API key search */}
      {hasApiKey && (
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') search(searchQuery) }}
            placeholder="Search YouTube..."
            className="flex-1 bg-[var(--muted)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)]"
          />
          <button
            onClick={() => search(searchQuery)}
            disabled={searching}
            className="px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm hover:opacity-90 transition-opacity min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            <Search size={16} />
          </button>
        </div>
      )}

      {/* URL / video ID input (always shown) */}
      <div className="flex gap-2">
        <input
          type="text"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleUrlSubmit() }}
          placeholder={hasApiKey ? 'Or paste a YouTube URL...' : 'Paste a YouTube URL or video ID...'}
          className="flex-1 bg-[var(--muted)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)]"
        />
        <button
          onClick={handleUrlSubmit}
          className="px-3 py-2 rounded-lg bg-[var(--muted)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] text-sm transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          <Link size={16} />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {searching && (
        <p className="text-xs text-[var(--muted-foreground)]">Searching...</p>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {results.map(r => (
            <button
              key={r.videoId}
              onClick={() => playVideo(r.videoId)}
              className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-left min-h-[44px]"
            >
              {r.thumbnail && (
                <img
                  src={r.thumbnail}
                  alt=""
                  className="w-24 h-16 rounded object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--foreground)] line-clamp-2">{r.title}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{r.channel}</div>
              </div>
              <Play size={14} className="shrink-0 mt-1 text-[var(--muted-foreground)]" />
            </button>
          ))}
        </div>
      )}

      {!hasApiKey && results.length === 0 && !searching && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-[var(--muted-foreground)] text-center">
            Paste a YouTube URL above to play a video.
            <br />
            Add an API key in widget settings to enable search.
          </p>
        </div>
      )}
    </div>
  )
}
