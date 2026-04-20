// Spotify API helper module
// All API calls go through the access token provided by the widget config

const BASE_URL = 'https://api.spotify.com/v1'

export interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

export interface SpotifyArtist {
  id: string
  name: string
  uri: string
}

export interface SpotifyAlbum {
  id: string
  name: string
  images: SpotifyImage[]
  uri: string
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  duration_ms: number
  uri: string
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string | null
  images: SpotifyImage[]
  tracks: { total: number }
  uri: string
  owner: { display_name: string }
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  is_active: boolean
  volume_percent: number | null
}

export interface SpotifySearchResults {
  tracks?: { items: SpotifyTrack[] }
  artists?: { items: SpotifyArtist[] }
  albums?: { items: SpotifyAlbum[] }
  playlists?: { items: SpotifyPlaylist[] }
}

export interface PlaylistTracksResponse {
  items: Array<{
    track: SpotifyTrack | null
    added_at: string
  }>
  total: number
  next: string | null
}

export interface RecentlyPlayedResponse {
  items: Array<{
    track: SpotifyTrack
    played_at: string
  }>
}

export interface SavedTracksResponse {
  items: Array<{
    track: SpotifyTrack
    added_at: string
  }>
  total: number
  next: string | null
}

async function spotifyFetch<T>(token: string, endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = new Error(`Spotify API error: ${res.status}`) as Error & { status: number }
    error.status = res.status
    throw error
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

export async function getUserPlaylists(token: string, limit = 50, offset = 0): Promise<{ items: SpotifyPlaylist[]; total: number }> {
  return spotifyFetch(token, `/me/playlists?limit=${limit}&offset=${offset}`)
}

export async function getPlaylistTracks(token: string, playlistId: string, limit = 50, offset = 0): Promise<PlaylistTracksResponse> {
  return spotifyFetch(token, `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`)
}

export async function getRecentlyPlayed(token: string, limit = 20): Promise<RecentlyPlayedResponse> {
  return spotifyFetch(token, `/me/player/recently-played?limit=${limit}`)
}

export async function getSavedTracks(token: string, limit = 50, offset = 0): Promise<SavedTracksResponse> {
  return spotifyFetch(token, `/me/tracks?limit=${limit}&offset=${offset}`)
}

export async function search(token: string, query: string, types = 'track,artist,album,playlist', limit = 10): Promise<SpotifySearchResults> {
  const params = new URLSearchParams({ q: query, type: types, limit: String(limit) })
  return spotifyFetch(token, `/search?${params.toString()}`)
}

export async function getDevices(token: string): Promise<{ devices: SpotifyDevice[] }> {
  return spotifyFetch(token, '/me/player/devices')
}

export async function transferPlayback(token: string, deviceId: string, play = false): Promise<void> {
  await spotifyFetch<void>(token, '/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play }),
  })
}

export async function startPlayback(
  token: string,
  options: { context_uri?: string; uris?: string[]; offset?: { position: number }; device_id?: string }
): Promise<void> {
  const { device_id, ...body } = options
  const endpoint = device_id ? `/me/player/play?device_id=${device_id}` : '/me/player/play'
  await spotifyFetch<void>(token, endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}
