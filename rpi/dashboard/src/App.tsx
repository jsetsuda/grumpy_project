import { ConfigProvider } from '@/config/config-provider'
import { DashboardGrid } from '@/components/dashboard-grid'
import { SpotifyCallback } from '@/widgets/music/spotify-callback'
import { GoogleCallback } from '@/widgets/photos/google-callback'

export default function App() {
  if (window.location.pathname === '/spotify-callback') {
    return <SpotifyCallback />
  }

  if (window.location.pathname === '/google-callback') {
    return <GoogleCallback />
  }

  return (
    <ConfigProvider>
      <DashboardGrid />
    </ConfigProvider>
  )
}
