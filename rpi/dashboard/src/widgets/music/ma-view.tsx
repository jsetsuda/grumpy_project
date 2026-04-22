import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Monitor, Search, ChevronLeft,
  Volume2, Loader2, Music,
} from 'lucide-react'
import { useMaClient, type MaBrowseItem, type MaMediaPlayer } from './ma-api'

interface MaViewProps {
  haUrl: string
  haToken: string
  targetPlayer: string | undefined
  onTargetPlayerChange: (entityId: string) => void
  /**
   * True while the shared-credentials context is still fetching. When
   * true we render a spinner instead of the "credentials missing" state
   * so a slow initial fetch doesn't flash the wrong message.
   */
  credsLoading?: boolean
  /**
   * Preferred default if the user hasn't picked one yet. Typically derived
   * from the current device id (e.g. pi-grumpy01 → media_player.pi_grumpy01_media_player).
   */
  preferredDefault?: string
}

type Tab = 'browse' | 'search' | 'devices'

export function MaView({ haUrl, haToken, targetPlayer, onTargetPlayerChange, credsLoading, preferredDefault }: MaViewProps) {
  const { connected, error, players, targetState, browse, playMedia, callService } =
    useMaClient({ haUrl, haToken, targetPlayer })

  const [tab, setTab] = useState<Tab>('browse')
  const [path, setPath] = useState<Array<{ title: string; type: string; id: string }>>([])
  const [node, setNode] = useState<MaBrowseItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MaBrowseItem[]>([])

  // If no target picked yet, pick the best MA-managed player. Preference:
  //  1. Exact preferredDefault match (when MA-managed).
  //  2. Any MA player whose entity id contains the device slug.
  //  3. The first MA player.
  // Skip non-MA players entirely — browse/play won't work on those.
  useEffect(() => {
    if (targetPlayer || players.length === 0) return
    const maPlayers = players.filter(p => p.isMa)
    if (maPlayers.length === 0) return

    let pick = preferredDefault && maPlayers.find(p => p.entityId === preferredDefault)
    if (!pick && preferredDefault) {
      // device id may not exactly match; try a substring match (e.g. the
      // user has 'media_player.mass_pi_grumpy01_xyz' for device 'pi-grumpy01').
      const slug = preferredDefault.replace('media_player.', '').replace(/_media_player$/, '')
      pick = maPlayers.find(p => p.entityId.includes(slug))
    }
    if (!pick) pick = maPlayers[0]
    onTargetPlayerChange(pick.entityId)
  }, [players, targetPlayer, preferredDefault, onTargetPlayerChange])

  const targetIsMa = targetPlayer ? !!players.find(p => p.entityId === targetPlayer)?.isMa : false

  // Load the root of the browse tree whenever the target changes.
  const loadRoot = useCallback(async () => {
    if (!connected || !targetPlayer) return
    setLoading(true)
    try {
      const root = await browse()
      setNode(root)
      setPath([])
    } catch {
      setNode(null)
    } finally {
      setLoading(false)
    }
  }, [connected, targetPlayer, browse])

  useEffect(() => {
    if (tab === 'browse') loadRoot()
  }, [tab, loadRoot])

  async function enterFolder(item: MaBrowseItem) {
    setLoading(true)
    try {
      const child = await browse(item.mediaContentType, item.mediaContentId)
      setPath(prev => [...prev, { title: item.title, type: item.mediaContentType, id: item.mediaContentId }])
      setNode(child)
    } finally {
      setLoading(false)
    }
  }

  async function goBack() {
    if (path.length === 0) return
    setLoading(true)
    try {
      const next = path.slice(0, -1)
      if (next.length === 0) {
        const root = await browse()
        setNode(root)
      } else {
        const tail = next[next.length - 1]
        const parent = await browse(tail.type, tail.id)
        setNode(parent)
      }
      setPath(next)
    } finally {
      setLoading(false)
    }
  }

  async function handlePlay(item: MaBrowseItem) {
    try {
      await playMedia(item.mediaContentId, item.mediaContentType)
    } catch (e) {
      console.error('[MA] play failed:', e)
    }
  }

  // Search: many MA providers accept the media_class "search" lookup via
  // browse_media with media_content_type="search". If MA rejects it, we
  // surface nothing and the user can still browse.
  const runSearch = useCallback(async () => {
    if (!searchQuery.trim() || !connected) return
    setLoading(true)
    try {
      // Empirically, MA's browse accepts a "search/<query>" content id.
      const result = await browse('search', `search/${searchQuery.trim()}`)
      setSearchResults(result.children || [])
    } catch (e) {
      console.warn('[MA] search unsupported or failed:', e)
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery, connected, browse])

  const albumArtUrl = useMemo(() => {
    if (!targetState?.albumArt) return undefined
    if (targetState.albumArt.startsWith('http')) return targetState.albumArt
    // entity_picture is a relative path — prefix with the HA base.
    return `${haUrl}${targetState.albumArt}`
  }, [targetState?.albumArt, haUrl])

  const isPlaying = targetState?.state === 'playing'

  // --- Render ---

  if (credsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
        <Loader2 size={14} className="animate-spin mr-2" /> Loading credentials…
      </div>
    )
  }

  if (!haUrl || !haToken) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted-foreground)] p-4 text-center">
        Music Assistant needs Home Assistant credentials. Open the Dashboard
        Manager and fill in Home Assistant under Shared Credentials.
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
        {error ? <span className="text-red-400">{error}</span> : (
          <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Connecting to Home Assistant…</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-2 gap-2 min-h-0">
      {/* Warn if the selected target isn't MA-managed (browse will return
          HA's generic media sources, play won't go through MA providers). */}
      {targetPlayer && !targetIsMa && (
        <div className="px-2 py-1.5 rounded text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/30">
          Selected player isn't managed by Music Assistant. Pick an MA-managed
          player in the Player tab, or add this player to MA at <code>:8095</code>.
        </div>
      )}

      {/* Now-playing header */}
      <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--muted)]/30">
        {albumArtUrl ? (
          <img src={albumArtUrl} alt="" className="w-14 h-14 rounded object-cover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded bg-[var(--muted)] flex items-center justify-center shrink-0">
            <Music size={20} className="text-[var(--muted-foreground)]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{targetState?.title || 'Nothing playing'}</div>
          <div className="text-xs text-[var(--muted-foreground)] truncate">
            {targetState?.artist || (targetPlayer ? players.find(p => p.entityId === targetPlayer)?.name || '' : 'Pick a player')}
          </div>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => callService('media_previous_track').catch(() => {})}
          disabled={!targetPlayer}
          className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors disabled:opacity-40 min-w-[40px] min-h-[40px] flex items-center justify-center"
          title="Previous"
        ><SkipBack size={18} /></button>
        <button
          onClick={() => callService(isPlaying ? 'media_pause' : 'media_play').catch(() => {})}
          disabled={!targetPlayer}
          className="p-3 hover:bg-[var(--muted)] rounded-full transition-colors disabled:opacity-40 min-w-[48px] min-h-[48px] flex items-center justify-center"
          title={isPlaying ? 'Pause' : 'Play'}
        >{isPlaying ? <Pause size={22} /> : <Play size={22} />}</button>
        <button
          onClick={() => callService('media_next_track').catch(() => {})}
          disabled={!targetPlayer}
          className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors disabled:opacity-40 min-w-[40px] min-h-[40px] flex items-center justify-center"
          title="Next"
        ><SkipForward size={18} /></button>
        <div className="flex items-center gap-2 ml-2">
          <Volume2 size={14} className="text-[var(--muted-foreground)]" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={targetState?.volume ?? 0.5}
            onChange={e => callService('volume_set', { volume_level: parseFloat(e.target.value) }).catch(() => {})}
            disabled={!targetPlayer}
            className="w-20 accent-[var(--primary)]"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        <TabButton active={tab === 'browse'} onClick={() => setTab('browse')} label="Browse" />
        <TabButton active={tab === 'search'} onClick={() => setTab('search')} label="Search" />
        <TabButton active={tab === 'devices'} onClick={() => setTab('devices')} label="Player" />
      </div>

      {/* Tab bodies */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === 'browse' && (
          <BrowseList
            node={node}
            path={path}
            loading={loading}
            onEnter={enterFolder}
            onPlay={handlePlay}
            onBack={goBack}
          />
        )}
        {tab === 'search' && (
          <div className="flex flex-col gap-2 p-1">
            <div className="flex gap-1">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
                placeholder="Search artists, albums, tracks…"
                className="flex-1 px-2 py-1.5 rounded bg-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
              <button
                onClick={runSearch}
                className="px-3 py-1.5 rounded bg-[var(--muted)] hover:bg-[var(--muted)]/70 text-sm flex items-center gap-1"
              ><Search size={14} /></button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-[var(--muted-foreground)]">
                <Loader2 size={14} className="animate-spin mr-2" /> Searching…
              </div>
            ) : (
              <ItemList items={searchResults} onEnter={enterFolder} onPlay={handlePlay} />
            )}
            {!loading && searchQuery && searchResults.length === 0 && (
              <div className="text-xs text-[var(--muted-foreground)] text-center py-4">
                No results. (MA's search surface varies by provider — try browsing instead.)
              </div>
            )}
          </div>
        )}
        {tab === 'devices' && (
          <DeviceList players={players} selected={targetPlayer} onSelect={onTargetPlayerChange} />
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
        active
          ? 'text-[var(--foreground)] border-[var(--primary)]'
          : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
      }`}
    >{label}</button>
  )
}

function BrowseList({
  node, path, loading, onEnter, onPlay, onBack,
}: {
  node: MaBrowseItem | null
  path: Array<{ title: string; type: string; id: string }>
  loading: boolean
  onEnter: (item: MaBrowseItem) => void
  onPlay: (item: MaBrowseItem) => void
  onBack: () => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-[var(--muted-foreground)]">
        <Loader2 size={14} className="animate-spin mr-2" /> Loading…
      </div>
    )
  }
  if (!node) {
    return <div className="text-xs text-[var(--muted-foreground)] p-3">No library available on this player.</div>
  }

  // At the root of an MA-managed entity, HA mixes in its generic media
  // sources (AI Generated Images, Camera, Image Upload, Radio Browser,
  // TTS, UniFi Protect, etc.) alongside MA's own categories. Filter
  // those out — they're not music. Subtree browsing is unaffected.
  const rawChildren = node.children || []
  const items = path.length === 0
    ? rawChildren.filter(c => !c.mediaContentId.startsWith('media-source://'))
    : rawChildren

  return (
    <div className="flex flex-col gap-1 p-1">
      {/* Breadcrumb / back */}
      {path.length > 0 && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft size={14} /> {path.map(p => p.title).join(' › ')}
        </button>
      )}
      <ItemList items={items} onEnter={onEnter} onPlay={onPlay} />
    </div>
  )
}

function ItemList({
  items, onEnter, onPlay,
}: {
  items: MaBrowseItem[]
  onEnter: (item: MaBrowseItem) => void
  onPlay: (item: MaBrowseItem) => void
}) {
  if (items.length === 0) {
    return <div className="text-xs text-[var(--muted-foreground)] p-3 text-center">Empty.</div>
  }
  return (
    <div className="flex flex-col">
      {items.map((item, idx) => (
        <button
          key={`${item.mediaContentId}-${idx}`}
          onClick={() => {
            if (item.canExpand) onEnter(item)
            else if (item.canPlay) onPlay(item)
          }}
          className="flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--muted)] rounded transition-colors"
        >
          {item.thumbnail ? (
            <img src={item.thumbnail} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded bg-[var(--muted)]/70 flex items-center justify-center shrink-0">
              <Music size={14} className="text-[var(--muted-foreground)]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{item.title}</div>
            {item.mediaClass && (
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase">{item.mediaClass}</div>
            )}
          </div>
          {item.canPlay && !item.canExpand && (
            <Play size={14} className="text-[var(--muted-foreground)] shrink-0" />
          )}
        </button>
      ))}
    </div>
  )
}

function DeviceList({
  players, selected, onSelect,
}: {
  players: MaMediaPlayer[]
  selected: string | undefined
  onSelect: (entityId: string) => void
}) {
  if (players.length === 0) {
    return <div className="text-xs text-[var(--muted-foreground)] p-3">No media players found.</div>
  }
  // MA-managed players first, others below.
  const maPlayers = players.filter(p => p.isMa).sort((a, b) => a.name.localeCompare(b.name))
  const otherPlayers = players.filter(p => !p.isMa).sort((a, b) => a.name.localeCompare(b.name))
  const sorted = [...maPlayers, ...otherPlayers]
  return (
    <div className="flex flex-col gap-1 p-1">
      {maPlayers.length > 0 && (
        <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Music Assistant players
        </div>
      )}
      {sorted.map((p, i) => {
        const isSelected = p.entityId === selected
        const showOthersHeader = i === maPlayers.length && otherPlayers.length > 0 && maPlayers.length > 0
        return (
          <div key={p.entityId}>
            {showOthersHeader && (
              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Other media players (no MA library)
              </div>
            )}
          <button
            onClick={() => onSelect(p.entityId)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded transition-colors ${
              isSelected ? 'bg-[var(--primary)]/20 text-[var(--foreground)]' : 'hover:bg-[var(--muted)]'
            } ${!p.isMa ? 'opacity-60' : ''}`}
          >
            <Monitor size={14} className={isSelected ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'} />
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{p.name}</div>
              <div className="text-[10px] text-[var(--muted-foreground)] truncate">{p.entityId} · {p.state}</div>
            </div>
          </button>
          </div>
        )
      })}
    </div>
  )
}
