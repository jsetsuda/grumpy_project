import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import type { WidgetProps } from '../types'
import { useSharedCredentials } from '@/config/credentials-provider'
import { AddressAutocomplete } from './address-autocomplete'

export type CommuteDirection = 'to' | 'from' | 'both'

export interface DestinationConfig {
  name: string
  /** New shape: single address, combined with config.homeAddress. */
  address?: string
  /** Direction for the new shape. Defaults to 'to'. */
  direction?: CommuteDirection
  /** Legacy shape (pre-home-address). Still supported for back-compat. */
  origin?: string
  destination?: string
}

export interface TrafficWidgetConfig {
  apiKey?: string // deprecated: read from shared credentials
  /** Central home/anchor address. Each destination is commuted to/from this. */
  homeAddress?: string
  destinations: DestinationConfig[]
}

interface CommuteLeg {
  origin: string
  destination: string
  label: string // what to render
}

interface CommuteResult {
  label: string
  duration: string
  durationInTraffic: string
  trafficCondition: 'normal' | 'moderate' | 'heavy'
}

const TRAFFIC_COLORS = {
  normal: '#22c55e',
  moderate: '#eab308',
  heavy: '#ef4444',
}

export function TrafficWidget({ config, onConfigChange }: WidgetProps<TrafficWidgetConfig>) {
  const [results, setResults] = useState<CommuteResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const { credentials } = useSharedCredentials()

  // Inline add/edit-home form state — lets the user manage destinations
  // without opening the settings panel.
  const [showAddForm, setShowAddForm] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAddress, setDraftAddress] = useState('')
  const [draftDirection, setDraftDirection] = useState<CommuteDirection>('to')
  const [editingHome, setEditingHome] = useState(false)
  const [homeDraft, setHomeDraft] = useState('')

  const apiKey = credentials?.googleMaps?.apiKey || config.apiKey
  const destinations = config.destinations || []
  const homeAddress = (config.homeAddress || '').trim()

  /**
   * Expand each destination into one or more (origin, destination, label) legs.
   * - New shape: `address` + `direction`, combined with config.homeAddress.
   * - Legacy shape: explicit origin + destination fields.
   */
  function legsFor(dest: DestinationConfig): CommuteLeg[] {
    const legs: CommuteLeg[] = []
    const addr = (dest.address || '').trim()
    const name = dest.name || addr || 'Route'
    if (addr && homeAddress) {
      const dir = dest.direction || 'to'
      if (dir === 'to' || dir === 'both') {
        legs.push({ origin: homeAddress, destination: addr, label: `To ${name}` })
      }
      if (dir === 'from' || dir === 'both') {
        legs.push({ origin: addr, destination: homeAddress, label: `From ${name}` })
      }
    } else if (dest.origin && dest.destination) {
      legs.push({ origin: dest.origin, destination: dest.destination, label: name })
    }
    return legs
  }
  const allLegs = destinations.flatMap(legsFor)

  // Scrub duplicated apiKey from widget config.
  const scrubbedRef = useRef(false)
  useEffect(() => {
    if (scrubbedRef.current || !credentials) return
    if (config.apiKey && config.apiKey === credentials.googleMaps?.apiKey) {
      scrubbedRef.current = true
      const next = { ...config }
      delete next.apiKey
      onConfigChange(next)
    }
  }, [credentials, config, onConfigChange])

  const fetchCommutes = useCallback(async () => {
    if (!apiKey || allLegs.length === 0) return

    try {
      const newResults: CommuteResult[] = []

      for (const leg of allLegs) {
        const params = new URLSearchParams({
          origins: leg.origin,
          destinations: leg.destination,
          departure_time: 'now',
          key: apiKey,
        })

        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`)
        }

        const data = await res.json()

        if (data.rows?.[0]?.elements?.[0]?.status === 'OK') {
          const element = data.rows[0].elements[0]
          const baseDuration = element.duration?.value || 0
          const trafficDuration = element.duration_in_traffic?.value || baseDuration

          const ratio = baseDuration > 0 ? trafficDuration / baseDuration : 1
          let condition: 'normal' | 'moderate' | 'heavy' = 'normal'
          if (ratio > 1.5) condition = 'heavy'
          else if (ratio > 1.2) condition = 'moderate'

          newResults.push({
            label: leg.label,
            duration: element.duration?.text || 'Unknown',
            durationInTraffic: element.duration_in_traffic?.text || element.duration?.text || 'Unknown',
            trafficCondition: condition,
          })
        } else {
          newResults.push({
            label: leg.label,
            duration: 'N/A',
            durationInTraffic: 'N/A',
            trafficCondition: 'normal',
          })
        }
      }

      setResults(newResults)
      setError(null)
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message || 'Failed to fetch commute data')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, JSON.stringify(allLegs)])

  useEffect(() => {
    if (!apiKey || allLegs.length === 0) return

    fetchCommutes()
    const interval = setInterval(fetchCommutes, 5 * 60 * 1000) // 5 minutes
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCommutes, apiKey, allLegs.length])

  function saveNewDestination() {
    const addr = draftAddress.trim()
    if (!addr) return
    const newDest: DestinationConfig = {
      name: (draftName.trim() || addr).slice(0, 60),
      address: addr,
      direction: draftDirection,
    }
    onConfigChange({ destinations: [...destinations, newDest] })
    setDraftName('')
    setDraftAddress('')
    setDraftDirection('to')
    setShowAddForm(false)
  }

  function removeDestinationAt(index: number) {
    onConfigChange({ destinations: destinations.filter((_, i) => i !== index) })
  }

  function saveHome() {
    const h = homeDraft.trim()
    if (!h) return
    onConfigChange({ homeAddress: h })
    setEditingHome(false)
  }

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4 text-center">
        <span className="text-2xl mb-2">{'\u{1F697}'}</span>
        <p className="text-sm">Traffic not configured</p>
        <p className="text-xs mt-1">Add a Google Maps API key in Shared Credentials.</p>
      </div>
    )
  }

  // First-run: no home address. Let the user set it inline.
  if (!homeAddress || editingHome) {
    return (
      <div className="flex flex-col h-full px-4 py-3 gap-2">
        <h3 className="text-sm font-medium text-[var(--foreground)]">Set home address</h3>
        <p className="text-xs text-[var(--muted-foreground)]">
          Commute legs are calculated to/from this address.
        </p>
        <AddressAutocomplete
          value={homeDraft || homeAddress}
          onChange={setHomeDraft}
          apiKey={apiKey}
          placeholder="Start typing an address…"
        />
        <div className="flex gap-2 mt-1">
          <button
            onClick={saveHome}
            disabled={!(homeDraft || homeAddress).trim()}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >Save</button>
          {homeAddress && (
            <button
              onClick={() => { setEditingHome(false); setHomeDraft('') }}
              className="px-3 py-1.5 rounded bg-[var(--muted)] text-xs transition-colors hover:bg-[var(--muted)]/70"
            >Cancel</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-4 py-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => { setEditingHome(true); setHomeDraft(homeAddress) }}
          className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors truncate"
          title="Click to change home address"
        >
          Commute · home: <span className="text-[var(--foreground)]/80">{homeAddress}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && (
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
            title={showAddForm ? 'Cancel' : 'Add a destination'}
          >
            {showAddForm ? <X size={14} /> : <Plus size={14} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-2 px-1">{error}</div>
      )}

      {showAddForm && (
        <div className="mb-2 p-2 rounded-lg bg-[var(--muted)] space-y-2">
          <input
            type="text"
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <AddressAutocomplete
            value={draftAddress}
            onChange={setDraftAddress}
            apiKey={apiKey}
            placeholder="Start typing an address…"
          />
          <div className="flex gap-1">
            {(['to', 'from', 'both'] as const).map(dir => (
              <button
                key={dir}
                onClick={() => setDraftDirection(dir)}
                className={`flex-1 px-2 py-1 rounded text-xs capitalize transition-colors ${
                  draftDirection === dir
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >{dir === 'both' ? 'Both' : dir === 'to' ? 'To' : 'From'}</button>
            ))}
          </div>
          <button
            onClick={saveNewDestination}
            disabled={!draftAddress.trim()}
            className="w-full px-3 py-1.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >Add</button>
        </div>
      )}

      <div className="space-y-2 flex-1">
        {results.map((result, i) => (
          <div
            key={i}
            className="group flex items-center gap-3 p-3 rounded-lg bg-[var(--muted)]"
          >
            <div
              className="w-2 h-8 rounded-full shrink-0"
              style={{ backgroundColor: TRAFFIC_COLORS[result.trafficCondition] }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{result.label}</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {result.trafficCondition === 'normal' && 'Normal traffic'}
                {result.trafficCondition === 'moderate' && 'Moderate traffic'}
                {result.trafficCondition === 'heavy' && 'Heavy traffic'}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold">{result.durationInTraffic}</div>
              {result.durationInTraffic !== result.duration && (
                <div className="text-[10px] text-[var(--muted-foreground)] line-through">
                  {result.duration}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Destination rows (for remove control). Each destination may
            expand to multiple result legs; we list destinations here so
            the user can remove a destination wholesale. */}
        {destinations.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)]/50">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] px-1 pb-1">Destinations</div>
            {destinations.map((d, i) => {
              const label = d.name || d.address || `Dest ${i + 1}`
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <span className="flex-1 truncate text-[var(--muted-foreground)]">
                    {label}
                  </span>
                  <button
                    onClick={() => removeDestinationAt(i)}
                    className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors"
                    title="Remove destination"
                  ><X size={12} /></button>
                </div>
              )
            })}
          </div>
        )}

        {results.length === 0 && destinations.length === 0 && !showAddForm && (
          <div className="text-xs text-[var(--muted-foreground)] text-center py-4">
            No destinations yet. Tap + to add one.
          </div>
        )}
      </div>
    </div>
  )
}
