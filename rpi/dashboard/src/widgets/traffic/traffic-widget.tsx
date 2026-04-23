import { useState, useEffect, useCallback, useRef } from 'react'
import type { WidgetProps } from '../types'
import { useSharedCredentials } from '@/config/credentials-provider'

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

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <span className="text-2xl mb-2">{'\u{1F697}'}</span>
        <p className="text-sm">Traffic not configured</p>
        <p className="text-xs mt-1">Add Google Maps API key in settings</p>
      </div>
    )
  }

  if (allLegs.length === 0) {
    const needHome = destinations.some(d => (d.address || '').trim()) && !homeAddress
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4 text-center">
        <span className="text-2xl mb-2">{'\u{1F697}'}</span>
        <p className="text-sm">{needHome ? 'Home address not set' : 'No destinations configured'}</p>
        <p className="text-xs mt-1">
          {needHome
            ? 'Add a home address in widget settings.'
            : 'Set a home address and add destinations in widget settings.'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-4 py-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">Commute</h3>
        {lastUpdated && (
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <div className="space-y-2 flex-1">
        {results.map((result, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-lg bg-[var(--muted)]"
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
      </div>
    </div>
  )
}
