import { ConfigProvider } from '@/config/config-provider'
import { DashboardGrid } from '@/components/dashboard-grid'
import { SpotifyCallback } from '@/widgets/music/spotify-callback'

export default function App() {
  if (window.location.pathname === '/spotify-callback') {
    return <SpotifyCallback />
  }

  return (
    <ConfigProvider>
      <DashboardGrid />
    </ConfigProvider>
  )
}
