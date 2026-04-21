import { useState, useEffect, useRef } from 'react'
import type { BackgroundPhotosConfig } from '@/config/types'

interface BackgroundLayerProps {
  config: BackgroundPhotosConfig
  overlay: number // 0-100
}

interface PhotoItem {
  id: string
  url: string
}

export function BackgroundLayer({ config, overlay }: BackgroundLayerProps) {
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
      setCurrentIndex(0)
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
      const photosList: PhotoItem[] = []
      if (data.photos) {
        for (const photo of data.photos.slice(0, 50)) {
          if (photo.derivatives) {
            const derivatives = Object.values(photo.derivatives) as any[]
            const largest = derivatives.reduce((a: any, b: any) =>
              (parseInt(a.width || '0') > parseInt(b.width || '0')) ? a : b
            , derivatives[0])
            if (largest?.checksum) {
              const assetUrl = `https://${host}/${token}/sharedstreams/asset/${largest.checksum}?derivativeKey=${largest.checksum}`
              photosList.push({
                id: photo.photoGuid || photo.batchGuid || String(photosList.length),
                url: `/api/proxy?url=${encodeURIComponent(assetUrl)}`,
              })
            }
          }
        }
      }
      setPhotos(photosList)
      setCurrentIndex(0)
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

  if (provider === 'none' || photos.length === 0) return null

  const current = photos[currentIndex]

  return (
    <div className="fixed inset-0 z-0">
      <img
        src={current.url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-2000"
      />
      {/* Dark overlay for readability */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: `rgba(0, 0, 0, ${overlay / 100})` }}
      />
    </div>
  )
}
