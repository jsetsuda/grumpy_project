import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface Prediction {
  description: string
  placeId: string
}

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  apiKey?: string
  placeholder?: string
  /**
   * Optional bias — restrict suggestions by type. Google supports:
   *  'geocode' — addresses only
   *  'address' — street-level only
   *  '(cities)' / '(regions)' etc.
   * Default: undefined → all types.
   */
  types?: string
}

/**
 * Inline Google Places Autocomplete. Proxies through /api/proxy to dodge
 * CORS + mixed-content for our self-signed HTTPS dashboard.
 *
 * Requires a Google Maps API key with the "Places API" enabled (separate
 * from "Distance Matrix API" which we already use). If the key is missing
 * or Places isn't enabled, the component silently degrades to a plain text
 * input with no suggestions.
 */
export function AddressAutocomplete({ value, onChange, apiKey, placeholder, types }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const focusedIndexRef = useRef<number>(-1)

  // Keep local query synced when parent updates value externally.
  useEffect(() => { setQuery(value) }, [value])

  // Close dropdown on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const runSearch = useCallback(async (input: string) => {
    if (!apiKey || input.trim().length < 3) {
      setPredictions([])
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    try {
      const params = new URLSearchParams({ input, key: apiKey })
      if (types) params.set('types', types)
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: ac.signal })
      if (!res.ok) {
        setPredictions([])
        return
      }
      const data = await res.json()
      if (data.status === 'REQUEST_DENIED') {
        // Almost always "Places API not enabled" or key restrictions.
        console.warn('[autocomplete] Places API denied:', data.error_message)
        setPredictions([])
        return
      }
      const preds: Prediction[] = (data.predictions || []).map((p: { description: string; place_id: string }) => ({
        description: p.description,
        placeId: p.place_id,
      }))
      setPredictions(preds)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.warn('[autocomplete] fetch failed:', e)
      }
      setPredictions([])
    } finally {
      setLoading(false)
    }
  }, [apiKey, types])

  function onInput(v: string) {
    setQuery(v)
    onChange(v)
    setOpen(true)
    focusedIndexRef.current = -1
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(v), 350)
  }

  function pick(pred: Prediction) {
    setQuery(pred.description)
    onChange(pred.description)
    setPredictions([])
    setOpen(false)
  }

  const showDropdown = open && (predictions.length > 0 || loading)

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => onInput(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); return }
            if (e.key === 'ArrowDown' && predictions.length > 0) {
              e.preventDefault()
              focusedIndexRef.current = Math.min(focusedIndexRef.current + 1, predictions.length - 1)
              // Small re-render trick: tiny state jitter
              setOpen(true)
            } else if (e.key === 'ArrowUp' && predictions.length > 0) {
              e.preventDefault()
              focusedIndexRef.current = Math.max(focusedIndexRef.current - 1, 0)
              setOpen(true)
            } else if (e.key === 'Enter' && focusedIndexRef.current >= 0 && predictions[focusedIndexRef.current]) {
              e.preventDefault()
              pick(predictions[focusedIndexRef.current])
            }
          }}
          placeholder={placeholder}
          className="w-full px-2.5 py-1.5 pr-7 bg-[var(--background)] border border-[var(--border)] rounded text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        </span>
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {predictions.length === 0 && loading && (
            <div className="px-3 py-2 text-xs text-[var(--muted-foreground)]">Searching…</div>
          )}
          {predictions.map((p, i) => (
            <button
              key={p.placeId + i}
              onClick={() => pick(p)}
              onMouseDown={e => e.preventDefault() /* keep focus on input */}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--muted)] border-b last:border-b-0 border-[var(--border)]/50"
            >
              {p.description}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
