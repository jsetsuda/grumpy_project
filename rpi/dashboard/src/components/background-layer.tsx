import { useState, useEffect, useRef } from 'react'
import type { BackgroundPhotosConfig } from '@/config/types'

interface BackgroundLayerProps {
  config: BackgroundPhotosConfig
  overlay: number // 0-100
  fullscreen?: boolean
}

interface PhotoItem {
  id: string
  url: string
}

export function BackgroundLayer({ config, overlay, fullscreen }: BackgroundLayerProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const googleTokenRef = useRef<{ accessToken: string; expiry: number } | null>(null)

  const provider = config.provider || 'none'
  const interval = (config.interval || 30) * 1000

  useEffect(() => {
    if (provider === 'none') return
    if (provider === 'immich' && config.immich?.serverUrl && config.immich?.apiKey) {
      fetchImmichPhotos()
    }
    if (provider === 'google' && config.google?.clientId && config.google?.clientSecret && config.google?.refreshToken) {
      fetchGooglePhotos()
    }
    if (provider === 'icloud' && config.icloud?.sharedAlbumUrl) {
      fetchICloudPhotos()
    }
    if (provider === 'local' && config.local?.baseUrl) {
      // For local, just set a single photo URL
      setPhotos([{ id: 'local', url: config.local.baseUrl }])
    }
  }, [provider, config.immich?.serverUrl, config.immich?.apiKey, config.immich?.albumId, config.google?.refreshToken, config.google?.albumId, config.icloud?.sharedAlbumUrl, config.local?.baseUrl])

  // Cloud providers return signed URLs with ~1h TTL — refetch periodically so they don't go stale.
  useEffect(() => {
    if (provider !== 'icloud' && provider !== 'google') return
    const refresh = setInterval(() => {
      if (provider === 'icloud' && config.icloud?.sharedAlbumUrl) fetchICloudPhotos()
      if (provider === 'google' && config.google?.refreshToken) fetchGooglePhotos()
    }, 30 * 60 * 1000)
    return () => clearInterval(refresh)
  }, [provider, config.icloud?.sharedAlbumUrl, config.google?.refreshToken])

  useEffect(() => {
    if (photos.length <= 1) return
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length)
    }, interval)
    return () => clearInterval(timer)
  }, [photos.length, interval])

  async function getGoogleAccessToken(): Promise<string> {
    if (!config.google) throw new Error('Google config missing')
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
    try {
      const accessToken = await getGoogleAccessToken()
      let mediaItems: any[] = []
      if (config.google?.albumId) {
        const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ albumId: config.google.albumId, pageSize: 50 }),
        })
        if (!res.ok) return
        const data = await res.json()
        mediaItems = data.mediaItems || []
      } else {
        const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        if (!res.ok) return
        const data = await res.json()
        mediaItems = data.mediaItems || []
      }
      const photoItems: PhotoItem[] = mediaItems
        .filter((item: any) => item.mimeType?.startsWith('image/'))
        .map((item: any) => ({
          id: item.id,
          url: `${item.baseUrl}=w1920-h1080`,
        }))
      setPhotos(photoItems)
      setCurrentIndex(prev => prev < photoItems.length ? prev : 0)
    } catch {
      // Silently fail for background
    }
  }

  async function fetchICloudPhotos() {
    try {
      const albumUrl = config.icloud!.sharedAlbumUrl.trim()
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
          return
        }
      }

      if (!res.ok) return
      const data = await res.json()

      if (!data.photos || data.photos.length === 0) return

      // Get actual download URLs via webasseturls
      const photoGuids = data.photos.slice(0, 50).map((p: any) => p.photoGuid).filter(Boolean)
      const urlsEndpoint = `https://${host}/${token}/sharedstreams/webasseturls`
      const urlsRes = await fetch(`/api/proxy?url=${encodeURIComponent(urlsEndpoint)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoGuids }),
      })
      if (!urlsRes.ok) return
      const urlsData = await urlsRes.json()

      const photosList: PhotoItem[] = []
      if (urlsData.items) {
        for (const [checksum, info] of Object.entries(urlsData.items) as [string, any][]) {
          if (info.url_path && info.url_location) {
            const loc = urlsData.locations?.[info.url_location]
            const scheme = loc?.scheme || 'https'
            const photoUrl = `${scheme}://${info.url_location}${info.url_path}`
            photosList.push({
              id: checksum,
              url: `/api/proxy?url=${encodeURIComponent(photoUrl)}`,
            })
          }
        }
      }
      setPhotos(photosList)
      setCurrentIndex(prev => prev < photosList.length ? prev : 0)
    } catch {
      // Silently fail
    }
  }

  async function fetchImmichPhotos() {
    if (!config.immich) return
    try {
      const { serverUrl, apiKey, albumId } = config.immich
      const baseUrl = serverUrl.replace(/\/$/, '')
      let assets: any[] = []
      if (albumId) {
        const res = await fetch(`${baseUrl}/api/albums/${albumId}`, {
          headers: { 'x-api-key': apiKey },
        })
        if (!res.ok) return
        const data = await res.json()
        assets = data.assets || []
      } else {
        const res = await fetch(`${baseUrl}/api/assets?order=random&size=50`, {
          headers: { 'x-api-key': apiKey },
        })
        if (!res.ok) return
        assets = await res.json()
      }
      const photoItems: PhotoItem[] = assets
        .filter((a: any) => a.type === 'IMAGE')
        .map((a: any) => ({
          id: a.id,
          url: `${baseUrl}/api/assets/${a.id}/thumbnail?size=preview&key=${apiKey}`,
        }))
      setPhotos(photoItems)
      setCurrentIndex(0)
    } catch {
      // Silently fail
    }
  }

  function goNext() {
    setCurrentIndex(prev => (prev + 1) % photos.length)
  }

  function goPrev() {
    setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length)
  }

  if (provider === 'none' || photos.length === 0) return null

  const current = photos[currentIndex]

  return (
    <div className="fixed inset-0 z-0 bg-[var(--background)]">
      <img
        src={current.url}
        alt=""
        className="absolute inset-0 w-full h-full object-contain transition-opacity duration-2000"
        style={{ filter: fullscreen ? 'none' : `brightness(${1 - overlay / 100})` }}
      />
      {/* Screensaver controls */}
      {/* Large touch areas for prev/next — fill most of the screen height, avoid top bar and now-playing */}
      {fullscreen && photos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev() }}
            className="absolute left-0 top-[100px] bottom-[100px] w-[15%] flex items-center justify-center text-white/60 hover:text-white hover:bg-black/10 transition-colors z-10"
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext() }}
            className="absolute right-0 top-[100px] bottom-[100px] w-[15%] flex items-center justify-center text-white/60 hover:text-white hover:bg-black/10 transition-colors z-10"
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </>
      )}
    </div>
  )
}
