import { ConfigProvider } from '@/config/config-provider'
import { DashboardGrid } from '@/components/dashboard-grid'

export default function App() {
  return (
    <ConfigProvider>
      <DashboardGrid />
    </ConfigProvider>
  )
}
