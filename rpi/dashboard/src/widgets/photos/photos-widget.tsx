import { useState, useEffect, useCallback } from 'react'
import { Image, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WidgetProps } from '../types'

export interface PhotosConfig {
  provider: 'immich' | 'local' | 'none'
  immich?: {
    serverUrl: string
    apiKey: string
    albumId?: string
  }
  local?: {
    baseUrl: string // URL prefix where photos are served from
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

  const provider = config.provider || 'none'
  const interval = (config.interval || 30) * 1000

  useEffect(() => {
    if (provider === 'none') {
      setLoading(false)
      return
    }
    if (provider === 'immich' && config.immich?.serverUrl && config.immich?.apiKey) {
      fetchImmichPhotos()
    }
  }, [provider, config.immich?.serverUrl, config.immich?.apiKey, config.immich?.albumId])

  useEffect(() => {
    if (photos.length <= 1) return
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length)
    }, interval)
    return () => clearInterval(timer)
  }, [photos.length, interval])

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
