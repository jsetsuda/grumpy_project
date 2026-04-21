import { useState, useCallback } from 'react'
import { Search, Play, Video, Link, ListPlus, ListVideo, Minimize2, Maximize2, SkipForward, Clock, Eye, User, Plus, Trash2 } from 'lucide-react'
import type { WidgetProps } from '../types'

interface YouTubeChannel {
  channelId: string
  name: string
  thumbnail?: string
}

interface YouTubeConfig {
  apiKey?: string
  searchQuery?: string
  videoId?: string
  autoplay?: boolean
  autoplayNext?: boolean
  miniPlayer?: boolean
  channels?: YouTubeChannel[]
  watchLater?: { videoId: string; title: string; thumbnail: string; channel: string }[]
}

interface SearchResult {
  videoId: string
  title: string
  thumbnail: string
  channel: string
  viewCount?: string
  publishedAt?: string
}

type Tab = 'search' | 'channels' | 'queue'

function extractVideoId(input: string): string | null {
  if (/^[\w-]{11}$/.test(input.trim())) {
    return input.trim()
  }
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

function formatViewCount(count: string | undefined): string {
  if (!count) return ''
  const n = parseInt(count, 10)
  if (isNaN(n)) return count
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`
  return `${n} views`
}

function formatRelativeDate(dateStr: string | undefined): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  } catch {
    return ''
  }
}

export function YouTubeWidget({ config, onConfigChange }: WidgetProps<YouTubeConfig>) {
  const [searchQuery, setSearchQuery] = useState(config.searchQuery || '')
  const [urlInput, setUrlInput] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('search')
  const [channelInput, setChannelInput] = useState('')
  const [channelVideos, setChannelVideos] = useState<SearchResult[]>([])

  const hasApiKey = !!config.apiKey
  const channels = config.channels || []
  const watchLater = config.watchLater || []
  const isMini = config.miniPlayer === true

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
        maxResults: '10',
      })
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(`https://www.googleapis.com/youtube/v3/search?${params}`)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()

      const videoIds = (data.items || []).map((item: any) => item.id?.videoId).filter(Boolean).join(',')

      let statsMap: Record<string, { viewCount: string; publishedAt: string }> = {}
      if (videoIds) {
        try {
          const statsParams = new URLSearchParams({
            part: 'statistics,snippet',
            id: videoIds,
            key: config.apiKey,
          })
          const statsRes = await fetch(`/api/proxy?url=${encodeURIComponent(`https://www.googleapis.com/youtube/v3/videos?${statsParams}`)}`)
          if (statsRes.ok) {
            const statsData = await statsRes.json()
            for (const item of statsData.items || []) {
              statsMap[item.id] = {
                viewCount: item.statistics?.viewCount || '',
                publishedAt: item.snippet?.publishedAt || '',
              }
            }
          }
        } catch {
          // Stats are optional, proceed without them
        }
      }

      const items: SearchResult[] = (data.items || []).map((item: any) => ({
        videoId: item.id?.videoId || '',
        title: item.snippet?.title || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
        channel: item.snippet?.channelTitle || '',
        viewCount: statsMap[item.id?.videoId]?.viewCount,
        publishedAt: statsMap[item.id?.videoId]?.publishedAt || item.snippet?.publishedAt,
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

  const addToWatchLater = useCallback((result: SearchResult) => {
    const current = config.watchLater || []
    if (current.some(w => w.videoId === result.videoId)) return
    onConfigChange({
      watchLater: [...current, {
        videoId: result.videoId,
        title: result.title,
        thumbnail: result.thumbnail,
        channel: result.channel,
      }],
    })
  }, [config.watchLater, onConfigChange])

  const removeFromWatchLater = useCallback((videoId: string) => {
    const current = config.watchLater || []
    onConfigChange({ watchLater: current.filter(w => w.videoId !== videoId) })
  }, [config.watchLater, onConfigChange])

  const playNextInQueue = useCallback(() => {
    const queue = config.watchLater || []
    if (queue.length === 0) return
    const next = queue[0]
    onConfigChange({
      videoId: next.videoId,
      watchLater: queue.slice(1),
    })
  }, [config.watchLater, onConfigChange])

  const addChannel = useCallback(async () => {
    if (!config.apiKey || !channelInput.trim()) return
    setError('')
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        type: 'channel',
        q: channelInput.trim(),
        key: config.apiKey,
        maxResults: '1',
      })
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(`https://www.googleapis.com/youtube/v3/search?${params}`)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      const item = data.items?.[0]
      if (!item) {
        setError('Channel not found')
        return
      }
      const newChannel: YouTubeChannel = {
        channelId: item.id?.channelId || item.snippet?.channelId || '',
        name: item.snippet?.channelTitle || channelInput,
        thumbnail: item.snippet?.thumbnails?.default?.url || '',
      }
      const current = config.channels || []
      if (current.some(c => c.channelId === newChannel.channelId)) {
        setError('Channel already added')
        return
      }
      onConfigChange({ channels: [...current, newChannel] })
      setChannelInput('')
    } catch {
      setError('Failed to find channel')
    }
  }, [config.apiKey, channelInput, config.channels, onConfigChange])

  const removeChannel = useCallback((channelId: string) => {
    const current = config.channels || []
    onConfigChange({ channels: current.filter(c => c.channelId !== channelId) })
  }, [config.channels, onConfigChange])

  const loadChannelVideos = useCallback(async (channelId: string) => {
    if (!config.apiKey) return
    setSearching(true)
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        channelId,
        order: 'date',
        type: 'video',
        key: config.apiKey,
        maxResults: '10',
      })
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(`https://www.googleapis.com/youtube/v3/search?${params}`)}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      const items: SearchResult[] = (data.items || []).map((item: any) => ({
        videoId: item.id?.videoId || '',
        title: item.snippet?.title || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url || '',
        channel: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt,
      }))
      setChannelVideos(items)
    } catch {
      setError('Failed to load channel videos')
    } finally {
      setSearching(false)
    }
  }, [config.apiKey])

  // Auto-play next from queue when video ends (check periodically is not feasible with iframe)
  // Instead we provide a "Next" button

  // If we have a video playing, show the player
  if (config.videoId) {
    // Mini player mode
    if (isMini) {
      return (
        <div className="relative w-full h-full">
          <div className="absolute bottom-2 right-2 w-80 h-48 bg-black rounded-lg overflow-hidden shadow-2xl border border-[var(--border)] z-50">
            <iframe
              src={`https://www.youtube.com/embed/${config.videoId}?autoplay=${config.autoplay !== false ? 1 : 0}&enablejsapi=1`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title="YouTube Player"
            />
            <div className="absolute top-1 right-1 flex gap-1">
              <button
                onClick={() => onConfigChange({ miniPlayer: false })}
                className="p-1 bg-black/70 rounded text-white hover:bg-black/90 transition-colors"
              >
                <Maximize2 size={12} />
              </button>
              <button
                onClick={() => onConfigChange({ videoId: undefined, miniPlayer: false })}
                className="p-1 bg-black/70 rounded text-white hover:bg-black/90 transition-colors"
              >
                <Search size={12} />
              </button>
            </div>
          </div>
        </div>
      )
    }

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
          <button
            onClick={() => onConfigChange({ miniPlayer: true })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-xs text-[var(--muted-foreground)] transition-colors min-h-[32px]"
          >
            <Minimize2 size={12} /> Mini
          </button>
          {watchLater.length > 0 && (
            <button
              onClick={playNextInQueue}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-xs text-[var(--muted-foreground)] transition-colors min-h-[32px]"
            >
              <SkipForward size={12} /> Next ({watchLater.length})
            </button>
          )}
        </div>
      </div>
    )
  }

  // Browse view with tabs
  return (
    <div className="flex flex-col h-full p-2 gap-2">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Video size={18} />
        <span className="text-sm font-medium">YouTube</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        <button
          onClick={() => setTab('search')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors min-h-[32px] ${tab === 'search' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80'}`}
        >
          <Search size={12} /> Search
        </button>
        {hasApiKey && (
          <button
            onClick={() => setTab('channels')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors min-h-[32px] ${tab === 'channels' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80'}`}
          >
            <User size={12} /> Channels ({channels.length})
          </button>
        )}
        <button
          onClick={() => setTab('queue')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors min-h-[32px] ${tab === 'queue' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80'}`}
        >
          <ListVideo size={12} /> Queue ({watchLater.length})
        </button>
      </div>

      {/* Search Tab */}
      {tab === 'search' && (
        <>
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
        </>
      )}

      {/* Channels Tab */}
      {tab === 'channels' && hasApiKey && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addChannel() }}
              placeholder="Search for a channel..."
              className="flex-1 bg-[var(--muted)] text-[var(--foreground)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-[var(--ring)]"
            />
            <button
              onClick={addChannel}
              className="px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm hover:opacity-90 transition-opacity min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {channels.map(ch => (
              <div key={ch.channelId} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
                {ch.thumbnail && (
                  <img src={ch.thumbnail} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                )}
                <button
                  onClick={() => loadChannelVideos(ch.channelId)}
                  className="flex-1 text-left text-sm text-[var(--foreground)] truncate min-h-[32px] flex items-center"
                >
                  {ch.name}
                </button>
                <button
                  onClick={() => removeChannel(ch.channelId)}
                  className="p-1.5 rounded hover:bg-red-500/20 text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {channels.length === 0 && (
              <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
                No saved channels. Search for a channel above to add it.
              </p>
            )}
          </div>
        </>
      )}

      {/* Queue Tab */}
      {tab === 'queue' && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {watchLater.length > 0 && (
            <button
              onClick={playNextInQueue}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm hover:opacity-90 transition-opacity min-h-[40px]"
            >
              <Play size={14} /> Play Queue
            </button>
          )}
          {watchLater.map(item => (
            <div key={item.videoId} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
              {item.thumbnail && (
                <img src={item.thumbnail} alt="" className="w-20 h-14 rounded object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => playVideo(item.videoId)}
                  className="text-left text-sm text-[var(--foreground)] line-clamp-2 w-full"
                >
                  {item.title}
                </button>
                <div className="text-xs text-[var(--muted-foreground)]">{item.channel}</div>
              </div>
              <button
                onClick={() => removeFromWatchLater(item.videoId)}
                className="p-1.5 rounded hover:bg-red-500/20 text-[var(--muted-foreground)] hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {watchLater.length === 0 && (
            <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
              No videos in queue. Use the + button on search results to add videos.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {searching && <p className="text-xs text-[var(--muted-foreground)]">Searching...</p>}

      {/* Search results or channel videos */}
      {tab === 'search' && results.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {results.map(r => (
            <div key={r.videoId} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
              <button
                onClick={() => playVideo(r.videoId)}
                className="flex items-start gap-3 flex-1 text-left min-h-[44px]"
              >
                {r.thumbnail && (
                  <img src={r.thumbnail} alt="" className="w-24 h-16 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--foreground)] line-clamp-2">{r.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{r.channel}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {r.viewCount && (
                      <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-0.5">
                        <Eye size={10} /> {formatViewCount(r.viewCount)}
                      </span>
                    )}
                    {r.publishedAt && (
                      <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-0.5">
                        <Clock size={10} /> {formatRelativeDate(r.publishedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <button
                onClick={() => addToWatchLater(r)}
                className="p-1.5 rounded hover:bg-[var(--primary)]/20 text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors shrink-0"
                title="Add to Watch Later"
              >
                <ListPlus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'channels' && channelVideos.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Latest Videos</span>
            <button
              onClick={() => setChannelVideos([])}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Back to channels
            </button>
          </div>
          {channelVideos.map(r => (
            <div key={r.videoId} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
              <button
                onClick={() => playVideo(r.videoId)}
                className="flex items-start gap-3 flex-1 text-left min-h-[44px]"
              >
                {r.thumbnail && (
                  <img src={r.thumbnail} alt="" className="w-24 h-16 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--foreground)] line-clamp-2">{r.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{r.channel}</div>
                  {r.publishedAt && (
                    <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-0.5 mt-0.5">
                      <Clock size={10} /> {formatRelativeDate(r.publishedAt)}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => addToWatchLater(r)}
                className="p-1.5 rounded hover:bg-[var(--primary)]/20 text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors shrink-0"
                title="Add to Watch Later"
              >
                <ListPlus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'search' && !hasApiKey && results.length === 0 && !searching && (
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

