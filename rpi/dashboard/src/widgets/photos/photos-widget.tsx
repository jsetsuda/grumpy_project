import { useState, useEffect, useCallback, useRef } from 'react'
import { Image, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WidgetProps } from '../types'

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
}

export function PhotosWidget({ config }: WidgetProps<PhotosConfig>) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const googleTokenRef = useRef<{ accessToken: string; expiry: number } | null>(null)

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
    if (provider === 'google' && config.google?.clientId && config.google?.clientSecret && config.google?.refreshToken) {
      fetchGooglePhotos()
    }
    if (provider === 'icloud' && config.icloud?.sharedAlbumUrl) {
      fetchICloudPhotos()
    }
  }, [provider, config.immich?.serverUrl, config.immich?.apiKey, config.immich?.albumId, config.google?.refreshToken, config.google?.albumId, config.icloud?.sharedAlbumUrl])

  useEffect(() => {
    if (photos.length <= 1) return
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length)
    }, interval)
    return () => clearInterval(timer)
  }, [photos.length, interval])

  async function getGoogleAccessToken(): Promise<string> {
    if (!config.google) throw new Error('Google config missing')

    // Return cached token if still valid
    if (googleTokenRef.current && googleTokenRef.current.expiry > Date.now() + 60000) {
      return googleTokenRef.current.accessToken
    }

    const res = await fetch('/api/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        refreshToken: config.google.refreshToken,
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

      if (config.google?.albumId) {
        const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ albumId: config.google.albumId, pageSize: 50 }),
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
      const albumUrl = config.icloud!.sharedAlbumUrl.trim()
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

      // Extract photos from the stream
      const photos_list: PhotoItem[] = []

      if (data.photos) {
        for (const photo of data.photos.slice(0, 50)) {
          if (photo.derivatives) {
            // Get the largest derivative
            const derivatives = Object.values(photo.derivatives) as any[]
            const largest = derivatives.reduce((a: any, b: any) =>
              (parseInt(a.width || '0') > parseInt(b.width || '0')) ? a : b
            , derivatives[0])

            if (largest?.checksum) {
              const assetUrl = `https://${host}/${token}/sharedstreams/asset/${largest.checksum}?derivativeKey=${largest.checksum}`
              photos_list.push({
                id: photo.photoGuid || photo.batchGuid || String(photos_list.length),
                url: `/api/proxy?url=${encodeURIComponent(assetUrl)}`,
                caption: photo.caption || undefined,
              })
            }
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
      <img
        src={current.url}
        alt={current.caption || ''}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
      />

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
