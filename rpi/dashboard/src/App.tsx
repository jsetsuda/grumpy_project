import { ConfigProvider, useConfig } from '@/config/config-provider'
import { CredentialsProvider } from '@/config/credentials-provider'
import { DashboardGrid } from '@/components/dashboard-grid'
import { ZoneRenderer } from '@/components/zone-renderer'
import { SpotifyCallback } from '@/widgets/music/spotify-callback'
import { GoogleCallback } from '@/widgets/photos/google-callback'
import { MicrosoftCallback } from '@/widgets/todo/microsoft-callback'
import { DashboardManager } from '@/pages/manage'

function DashboardRouter() {
  const { config } = useConfig()

  // Use zone layout if a zoneLayout config is present with a templateId
  if (config.zoneLayout?.templateId) {
    return <ZoneRenderer />
  }

  return <DashboardGrid />
}

export default function App() {
  if (window.location.pathname === '/spotify-callback') {
    return <SpotifyCallback />
  }

  if (window.location.pathname === '/google-callback') {
    return <GoogleCallback />
  }

  if (window.location.pathname === '/microsoft-callback') {
    return <MicrosoftCallback />
  }

  if (window.location.pathname === '/manage') {
    return <DashboardManager />
  }

  return (
    <CredentialsProvider>
      <ConfigProvider>
        <DashboardRouter />
      </ConfigProvider>
    </CredentialsProvider>
  )
}
