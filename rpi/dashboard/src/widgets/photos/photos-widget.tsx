import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Image, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WidgetProps } from '../types'
import { useSharedCredentials } from '@/config/credentials-provider'

export interface PhotosConfig {
  provider: 'immich' | 'local' | 'google' | 'icloud' | 'amazon' | 'none'
  immich?: {
    serverUrl: string
    apiKey: string
    albumId?: string
  }
  local?: {
    baseUrl: string // URL prefix where photos are served from
  }
  google?: {
    clientId: string
    clientSecret: string
    refreshToken: string
    accessToken?: string
    tokenExpiry?: number
    albumId?: string
  }
  icloud?: {
    sharedAlbumUrl: string
  }
  interval: number // seconds between transitions
  transition: 'fade' | 'slide' | 'none'
}

interface PhotoItem {
  id: string
  url: string
  caption?: string
  /** True when the item is a video (renders as <video> instead of <img>). */
  isVideo?: boolean
}

export function PhotosWidget({ config, onConfigChange }: WidgetProps<PhotosConfig>) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const googleTokenRef = useRef<{ accessToken: string; expiry: number } | null>(null)
  const { credentials: sharedCreds } = useSharedCredentials()

  // Per-provider effective config: shared creds win, widget config is fallback.
  const effectiveIcloud = useMemo(
    () => sharedCreds?.icloud?.sharedAlbumUrl
      ? { sharedAlbumUrl: sharedCreds.icloud.sharedAlbumUrl }
      : config.icloud,
    [sharedCreds?.icloud, config.icloud],
  )
  const effectiveGoogle = useMemo(
    () => sharedCreds?.google?.refreshToken
      ? { ...config.google, ...sharedCreds.google }
      : config.google,
    [sharedCreds?.google, config.google],
  )

  // Scrub once shared creds are loaded. Drop fields from widget config
  // that duplicate shared creds, including ephemeral google access tokens.
  const scrubbedRef = useRef(false)
  useEffect(() => {
    if (scrubbedRef.current || sharedCreds === null) return
    scrubbedRef.current = true
    const next: PhotosConfig = { ...config }
    let changed = false
    if (config.icloud?.sharedAlbumUrl && sharedCreds?.icloud?.sharedAlbumUrl === config.icloud.sharedAlbumUrl) {
      delete next.icloud; changed = true
    }
    if (config.google && sharedCreds?.google?.refreshToken === config.google.refreshToken && sharedCreds?.google?.refreshToken) {
      // Keep an empty google object only if albumId is set (per-widget); otherwise drop.
      const albumId = config.google.albumId
      const cleaned = albumId ? { albumId } as PhotosConfig['google'] : undefined
      next.google = cleaned
      changed = true
    } else if (config.google && (config.google.accessToken || config.google.tokenExpiry)) {
      // Always strip ephemeral google tokens.
      const { accessToken: _at, tokenExpiry: _exp, ...rest } = config.google
      void _at; void _exp
      next.google = rest as PhotosConfig['google']
      changed = true
    }
    if (changed) onConfigChange(next)
  }, [sharedCreds, config, onConfigChange])

  const provider = config.provider || 'none'
  const interval = (config.interval || 30) * 1000

  useEffect(() => {
    if (provider === 'none' || provider === 'amazon') {
      setLoading(false)
      return
    }
    if (provider === 'immich' && config.immich?.serverUrl && config.immich?.apiKey) {
      fetchImmichPhotos()
    }
    if (provider === 'google' && effectiveGoogle?.clientId && effectiveGoogle?.clientSecret && effectiveGoogle?.refreshToken) {
      fetchGooglePhotos()
    }
    if (provider === 'icloud' && effectiveIcloud?.sharedAlbumUrl) {
      fetchICloudPhotos()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, config.immich?.serverUrl, config.immich?.apiKey, config.immich?.albumId, effectiveGoogle?.refreshToken, effectiveGoogle?.albumId, effectiveIcloud?.sharedAlbumUrl])

  useEffect(() => {
    if (photos.length <= 1) return
    // If the current slide is a video, don't schedule an auto-advance — the
    // <video> onEnded handler does it. Otherwise use the configured interval.
    const current = photos[currentIndex]
    if (current?.isVideo) return
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length)
    }, interval)
    return () => clearInterval(timer)
  }, [photos.length, interval, currentIndex, photos])

  async function getGoogleAccessToken(): Promise<string> {
    if (!effectiveGoogle) throw new Error('Google config missing')

    // Return cached token if still valid
    if (googleTokenRef.current && googleTokenRef.current.expiry > Date.now() + 60000) {
      return googleTokenRef.current.accessToken
    }

    const res = await fetch('/api/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: effectiveGoogle.clientId,
        clientSecret: effectiveGoogle.clientSecret,
        refreshToken: effectiveGoogle.refreshToken,
      }),
    })

    if (!res.ok) throw new Error('Failed to refresh Google token')
    const data = await res.json()

    if (!data.access_token) throw new Error('No access token in response')

    googleTokenRef.current = {
      accessToken: data.access_token,
      expiry: Date.now() + (data.expires_in || 3600) * 1000,
    }

    return data.access_token
  }

  async function fetchGooglePhotos() {
    setLoading(true)
    try {
      const accessToken = await getGoogleAccessToken()
      let mediaItems: any[] = []

      // albumId can be set per-widget (different albums per dashboard)
      // even when shared creds provide the auth.
      const albumId = config.google?.albumId || effectiveGoogle?.albumId
      if (albumId) {
        const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ albumId, pageSize: 50 }),
        })
        if (!res.ok) throw new Error(`Google Photos album: ${res.status}`)
        const data = await res.json()
        mediaItems = data.mediaItems || []
      } else {
        const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        if (!res.ok) throw new Error(`Google Photos: ${res.status}`)
        const data = await res.json()
        mediaItems = data.mediaItems || []
      }

      const photoItems: PhotoItem[] = mediaItems
        .filter((item: any) => item.mimeType?.startsWith('image/'))
        .map((item: any) => ({
          id: item.id,
          url: `${item.baseUrl}=w1024-h768`,
          caption: item.description || undefined,
        }))

      setPhotos(photoItems)
      setCurrentIndex(0)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Google Photos')
    } finally {
      setLoading(false)
    }
  }

  async function fetchICloudPhotos() {
    setLoading(true)
    try {
      const albumUrl = effectiveIcloud!.sharedAlbumUrl.trim()
      // Extract token from URL like https://www.icloud.com/sharedalbum/#TOKEN
      const token = albumUrl.includes('#') ? albumUrl.split('#')[1] : albumUrl

      // First try p01, handle 330 redirect to correct partition
      let host = 'p01-sharedstreams.icloud.com'
      let streamUrl = `https://${host}/${token}/sharedstreams/webstream`
      let res = await fetch(`/api/proxy?url=${encodeURIComponent(streamUrl)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamCtag: null }),
      })

      // Handle iCloud's custom 330 redirect
      if (!res.ok) {
        const text = await res.text()
        try {
          const redirect = JSON.parse(text)
          if (redirect['X-Apple-MMe-Host']) {
            host = redirect['X-Apple-MMe-Host']
            streamUrl = `https://${host}/${token}/sharedstreams/webstream`
            res = await fetch(`/api/proxy?url=${encodeURIComponent(streamUrl)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ streamCtag: null }),
            })
          }
        } catch {
          throw new Error(`iCloud shared album: ${res.status}`)
        }
      }

      if (!res.ok) throw new Error(`iCloud shared album: ${res.status}`)
      const data = await res.json()

      if (!data.photos || data.photos.length === 0) {
        setPhotos([])
        setError(null)
        return
      }

      // Collect item GUIDs and their largest derivative checksums.
      // Apple keys shared-album derivatives by their target longest-edge size
      // (e.g. "290", "1920", "2048", "6144") and sometimes "original" for the
      // full-res file. Rank by that key — it's orientation-independent, unlike
      // comparing width alone (which underscored portraits).
      //
      // For video items (photo.mediaAssetType === 'video'), the same ranking
      // applies: Apple exposes video derivatives at multiple sizes; the one
      // with the highest target-edge key is the best-quality playable asset.
      const rankDerivative = (key: string, deriv: any): number => {
        if (key === 'original') return Number.MAX_SAFE_INTEGER
        const keyNum = parseInt(key, 10)
        if (!Number.isNaN(keyNum) && keyNum > 0) return keyNum
        // Fallback: use max(width, height) from the derivative object.
        const w = parseInt(deriv?.width || '0', 10) || 0
        const h = parseInt(deriv?.height || '0', 10) || 0
        return Math.max(w, h)
      }
      const photoMap: Map<string, { guid: string; checksum: string; caption?: string; isVideo?: boolean }> = new Map()
      for (const photo of data.photos.slice(0, 50)) {
        if (!photo.derivatives) continue
        const isVideo = typeof photo.mediaAssetType === 'string'
          && /^video$/i.test(photo.mediaAssetType)
        const entries = Object.entries(photo.derivatives) as [string, any][]
        let best: { deriv: any; score: number } | null = null
        for (const [key, deriv] of entries) {
          const score = rankDerivative(key, deriv)
          if (!best || score > best.score) best = { deriv, score }
        }
        if (best?.deriv?.checksum) {
          photoMap.set(best.deriv.checksum, {
            guid: photo.photoGuid || photo.batchGuid || best.deriv.checksum,
            checksum: best.deriv.checksum,
            caption: photo.caption || undefined,
            isVideo,
          })
        }
      }

      // Get actual download URLs via webasseturls endpoint
      const photoGuids = data.photos.slice(0, 50).map((p: any) => p.photoGuid).filter(Boolean)
      const urlsEndpoint = `https://${host}/${token}/sharedstreams/webasseturls`
      const urlsRes = await fetch(`/api/proxy?url=${encodeURIComponent(urlsEndpoint)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoGuids }),
      })

      if (!urlsRes.ok) throw new Error(`iCloud asset URLs: ${urlsRes.status}`)
      const urlsData = await urlsRes.json()

      // Build photo items from the resolved URLs
      const photos_list: PhotoItem[] = []
      if (urlsData.items) {
        for (const [checksum, info] of Object.entries(urlsData.items) as [string, any][]) {
          const photoInfo = photoMap.get(checksum)
          if (info.url_path && info.url_location) {
            const loc = urlsData.locations?.[info.url_location]
            const scheme = loc?.scheme || 'https'
            const photoUrl = `${scheme}://${info.url_location}${info.url_path}`
            photos_list.push({
              id: photoInfo?.guid || checksum,
              url: `/api/proxy?url=${encodeURIComponent(photoUrl)}`,
              caption: photoInfo?.caption,
              isVideo: photoInfo?.isVideo,
            })
          }
        }
      }

      setPhotos(photos_list)
      setCurrentIndex(0)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load iCloud photos')
    } finally {
      setLoading(false)
    }
  }

  async function fetchImmichPhotos() {
    if (!config.immich) return
    setLoading(true)

    try {
      const { serverUrl, apiKey, albumId } = config.immich
      const baseUrl = serverUrl.replace(/\/$/, '')

      let assets: any[] = []

      if (albumId) {
        const res = await fetch(`${baseUrl}/api/albums/${albumId}`, {
          headers: { 'x-api-key': apiKey },
        })
        if (!res.ok) throw new Error(`Immich album: ${res.status}`)
        const data = await res.json()
        assets = data.assets || []
      } else {
        // Get random photos
        const res = await fetch(`${baseUrl}/api/assets?order=random&size=50`, {
          headers: { 'x-api-key': apiKey },
        })
        if (!res.ok) throw new Error(`Immich assets: ${res.status}`)
        assets = await res.json()
      }

      const photoItems: PhotoItem[] = assets
        .filter((a: any) => a.type === 'IMAGE')
        .map((a: any) => ({
          id: a.id,
          url: `${baseUrl}/api/assets/${a.id}/thumbnail?size=preview&key=${apiKey}`,
          caption: a.exifInfo?.description || undefined,
        }))

      setPhotos(photoItems)
      setCurrentIndex(0)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }

  const goNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % photos.length)
  }, [photos.length])

  const goPrev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length)
  }, [photos.length])

  if (provider === 'none') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Image size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No photo source connected</p>
        <p className="text-xs mt-1">Configure in widget settings</p>
      </div>
    )
  }

  if (provider === 'amazon') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] px-4">
        <Image size={32} className="mb-2 opacity-50" />
        <p className="text-sm text-center">Amazon Photos doesn't have a public API</p>
        <p className="text-xs mt-1 text-center">
          Sync photos to a local folder using the Amazon Photos desktop app, then use the "Local folder" option.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
        Loading photos...
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

  if (photos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        No photos found
      </div>
    )
  }

  const current = photos[currentIndex]

  return (
    <div className="relative h-full w-full group overflow-hidden rounded-xl">
      {current.isVideo ? (
        <video
          key={current.id /* force remount when the slide changes so autoplay re-fires */}
          src={current.url}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted /* required for autoplay without user gesture */
          playsInline /* iOS/Safari: don't force fullscreen */
          controls={false}
          onEnded={goNext /* advance the slideshow when the clip finishes */}
          onError={(e) => {
            // Usually means Chromium can't decode this codec (HEVC on ARM).
            // Log and skip to next; the rest of the album stays viewable.
            console.warn('[photos] video playback failed, skipping:', e)
            setTimeout(goNext, 500)
          }}
        />
      ) : (
        <img
          src={current.url}
          alt={current.caption || ''}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
        />
      )}

      {/* Caption overlay */}
      {current.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <p className="text-sm text-white">{current.caption}</p>
        </div>
      )}

      {/* Navigation arrows (show on hover/touch) */}
      {photos.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Dots indicator */}
      {photos.length > 1 && photos.length <= 10 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {photos.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === currentIndex ? 'bg-white' : 'bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
