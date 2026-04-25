import { ConfigProvider, useConfig } from '@/config/config-provider'
import { CredentialsProvider } from '@/config/credentials-provider'
import { DashboardGrid } from '@/components/dashboard-grid'
import { ZoneRenderer } from '@/components/zone-renderer'
import { DesignFrame, parseDesignSize } from '@/components/design-frame'
import { SpotifyCallback } from '@/widgets/music/spotify-callback'
import { GoogleCallback } from '@/widgets/photos/google-callback'
import { MicrosoftCallback } from '@/widgets/todo/microsoft-callback'
import { DashboardManager } from '@/pages/manage'

function DashboardRouter() {
  const { config } = useConfig()
  const designSize = parseDesignSize(config.designSize, config.designSizeCustom)

  // Use zone layout if a zoneLayout config is present with a templateId
  const inner = config.zoneLayout?.templateId
    ? <ZoneRenderer frameSize={designSize} />
    : <DashboardGrid frameSize={designSize} />

  return <DesignFrame size={designSize}>{inner}</DesignFrame>
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
