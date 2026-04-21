import { useState, useEffect, useCallback } from 'react'
import type { DashboardMeta } from '@/config/types'

interface DeviceAssignments {
  [deviceName: string]: string
}

interface SharedCredentials {
  homeAssistant?: { url: string; token: string }
  spotify?: { clientId: string; clientSecret: string; refreshToken: string }
  google?: { clientId: string; clientSecret: string; refreshToken: string }
  googleMaps?: { apiKey: string }
}

export function DashboardManager() {
  const [dashboards, setDashboards] = useState<DashboardMeta[]>([])
  const [devices, setDevices] = useState<DeviceAssignments>({})
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLayoutMode, setNewLayoutMode] = useState<'grid' | 'zones'>('grid')
  const [newDeviceName, setNewDeviceName] = useState('')
  const [cloneTarget, setCloneTarget] = useState<string | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [credentials, setCredentials] = useState<SharedCredentials>({})
  const [credentialsSaving, setCredentialsSaving] = useState(false)

  const loadDashboards = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboards')
      if (res.ok) {
        setDashboards(await res.json())
      }
    } catch {
      // ignore
    }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices')
      if (res.ok) {
        setDevices(await res.json())
      }
    } catch {
      // ignore
    }
  }, [])

  const loadCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/credentials')
      if (res.ok) {
        const data = await res.json()
        setCredentials(data)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadDashboards()
    loadDevices()
    loadCredentials()
  }, [loadDashboards, loadDevices, loadCredentials])

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreate() {
    if (!newName.trim()) return
    const id = slugify(newName)
    const now = new Date().toISOString()
    const dashboardFile = {
      meta: {
        id,
        name: newName.trim(),
        layoutMode: newLayoutMode,
        createdAt: now,
        updatedAt: now,
      },
      config: {
        version: 1,
        theme: 'midnight',
        backgroundMode: 'solid',
        backgroundOverlay: 60,
        showTopBar: true,
        topBarFont: 'system-ui',
        topBarSize: 'large',
        topBarBold: false,
        topBarBackground: true,
        topBarScale: 100,
        topBarHeight: 60,
        widgetStartY: 90,
        topBarShadow: true,
        topBarShadowSize: 8,
        topBarShadowOpacity: 80,
        topBarWeather: true,
        topBarWeatherMode: 'current',
        topBarForecastDays: 5,
        screensaverEnabled: true,
        screensaverTimeout: 300,
        widgetOpacity: 100,
        voiceEnabled: false,
        grid: { cols: 12, rowHeight: 80, margin: [12, 12] },
        widgets: [],
        ...(newLayoutMode === 'zones' ? {
          backgroundMode: 'photo',
          zoneLayout: {
            templateId: 'full-overlay',
            zones: [
              { regionId: 'top-left', widgetType: 'clock', widgetConfig: {} },
              { regionId: 'top-right', widgetType: 'weather', widgetConfig: {} },
              { regionId: 'left-panel', widgetType: 'calendar', widgetConfig: {} },
              { regionId: 'bottom-right', widgetType: 'todo', widgetConfig: {} },
            ],
            backgroundOverlay: 40,
          },
        } : {}),
      },
    }
    await fetch(`/api/dashboards/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dashboardFile),
    })
    setNewName('')
    setShowNewForm(false)
    loadDashboards()
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete dashboard "${id}"?`)) return
    await fetch(`/api/dashboards/${id}`, { method: 'DELETE' })
    loadDashboards()
  }

  async function handleClone(sourceId: string) {
    if (!cloneName.trim()) return
    const newId = slugify(cloneName)
    await fetch(`/api/dashboards/${sourceId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newId, newName: cloneName.trim() }),
    })
    setCloneTarget(null)
    setCloneName('')
    loadDashboards()
  }

  async function handleRename(id: string) {
    const trimmed = editingNameValue.trim()
    if (!trimmed) return
    await fetch(`/api/dashboards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    setEditingNameId(null)
    setEditingNameValue('')
    loadDashboards()
  }

  async function handleDeviceAssign(deviceName: string, dashboardId: string) {
    const updated = { ...devices, [deviceName]: dashboardId }
    setDevices(updated)
    await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }

  async function handleAddDevice() {
    if (!newDeviceName.trim()) return
    const updated = { ...devices, [newDeviceName.trim()]: 'default' }
    setDevices(updated)
    await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    setNewDeviceName('')
  }

  async function handleRemoveDevice(deviceName: string) {
    const updated = { ...devices }
    delete updated[deviceName]
    setDevices(updated)
    await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }

  async function handleSaveCredentials() {
    setCredentialsSaving(true)
    try {
      await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
    } catch {
      // ignore
    } finally {
      setCredentialsSaving(false)
    }
  }

  function updateCredentials(path: string[], value: string) {
    setCredentials(prev => {
      const next = { ...prev }
      if (path.length === 2) {
        const [section, field] = path
        const sectionKey = section as keyof SharedCredentials
        const existing = (next[sectionKey] || {}) as Record<string, string>
        ;(next as Record<string, unknown>)[section] = { ...existing, [field]: value }
      }
      return next
    })
  }

  function getDeviceUrl(deviceName: string): string {
    const base = window.location.origin
    return `${base}/?device=${encodeURIComponent(deviceName)}`
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Grumpy Dashboard Manager</h1>
          <a
            href="/"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        {/* Dashboards Section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-200">Dashboards</h2>
            <button
              onClick={() => setShowNewForm(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
            >
              New Dashboard
            </button>
          </div>

          {/* New Dashboard Form */}
          {showNewForm && (
            <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700">
              <div className="flex gap-3 items-end flex-wrap">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Kitchen"
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Layout Mode</label>
                  <select
                    value={newLayoutMode}
                    onChange={e => setNewLayoutMode(e.target.value as 'grid' | 'zones')}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="grid">Grid</option>
                    <option value="zones">Zones</option>
                  </select>
                </div>
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowNewForm(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Dashboard Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map(d => (
              <div key={d.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  {editingNameId === d.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={editingNameValue}
                        onChange={e => setEditingNameValue(e.target.value)}
                        className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(d.id)
                          if (e.key === 'Escape') setEditingNameId(null)
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => handleRename(d.id)}
                        className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNameId(null)}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <h3
                      className="font-semibold text-white cursor-pointer hover:text-blue-300 transition-colors"
                      onClick={() => { setEditingNameId(d.id); setEditingNameValue(d.name) }}
                      title="Click to rename"
                    >
                      {d.name}
                    </h3>
                  )}
                  <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300 shrink-0">
                    {d.layoutMode === 'grid' ? 'Grid' : 'Zones'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Updated: {formatDate(d.updatedAt)}
                </p>

                {/* Clone inline form */}
                {cloneTarget === d.id && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={cloneName}
                      onChange={e => setCloneName(e.target.value)}
                      placeholder="Clone name"
                      className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && handleClone(d.id)}
                    />
                    <button
                      onClick={() => handleClone(d.id)}
                      className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs transition-colors"
                    >
                      OK
                    </button>
                    <button
                      onClick={() => setCloneTarget(null)}
                      className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition-colors"
                    >
                      X
                    </button>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`/?dashboard=${d.id}`}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors"
                  >
                    Open
                  </a>
                  <a
                    href={`/?dashboard=${d.id}`}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs font-medium transition-colors"
                  >
                    Edit
                  </a>
                  <button
                    onClick={() => { setEditingNameId(d.id); setEditingNameValue(d.name) }}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs font-medium transition-colors"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => { setCloneTarget(d.id); setCloneName('') }}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs font-medium transition-colors"
                  >
                    Clone
                  </button>
                  {d.id !== 'default' && (
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs font-medium transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Shared Credentials Section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-200">Shared Credentials</h2>
            <button
              onClick={handleSaveCredentials}
              disabled={credentialsSaving}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 rounded text-xs font-medium transition-colors"
            >
              {credentialsSaving ? 'Saving...' : 'Save All'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Shared across all dashboards. Individual widgets can override.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Home Assistant */}
            <CredentialCard
              title="Home Assistant"
              status={credentials.homeAssistant?.url ? 'configured' : 'not set'}
              fields={[
                { label: 'URL', value: credentials.homeAssistant?.url || '', placeholder: 'http://homeassistant.local:8123', onChange: (v) => updateCredentials(['homeAssistant', 'url'], v) },
                { label: 'Access Token', value: credentials.homeAssistant?.token || '', placeholder: 'Long-lived token', type: 'password', onChange: (v) => updateCredentials(['homeAssistant', 'token'], v) },
              ]}
              note="Create a Long-Lived Access Token in HA: Profile → Long-Lived Access Tokens → Create Token"
            />

            {/* Spotify */}
            <CredentialCard
              title="Spotify"
              status={credentials.spotify?.refreshToken ? 'configured' : 'not set'}
              fields={[
                { label: 'Client ID', value: credentials.spotify?.clientId || '', placeholder: 'Client ID', onChange: (v) => updateCredentials(['spotify', 'clientId'], v) },
                { label: 'Client Secret', value: credentials.spotify?.clientSecret || '', placeholder: 'Client Secret', type: 'password', onChange: (v) => updateCredentials(['spotify', 'clientSecret'], v) },
                { label: 'Refresh Token', value: credentials.spotify?.refreshToken || '', placeholder: 'Refresh Token', type: 'password', onChange: (v) => updateCredentials(['spotify', 'refreshToken'], v) },
              ]}
              note="Create app at developer.spotify.com → Dashboard → Create App. Set redirect URI to http://127.0.0.1:5173/spotify-callback. Use the Authorize button in the Music widget to get the refresh token."
            />

            {/* Google Photos */}
            <CredentialCard
              title="Google Photos"
              status={credentials.google?.refreshToken ? 'configured' : 'not set'}
              fields={[
                { label: 'Client ID', value: credentials.google?.clientId || '', placeholder: 'Google Client ID', onChange: (v) => updateCredentials(['google', 'clientId'], v) },
                { label: 'Client Secret', value: credentials.google?.clientSecret || '', placeholder: 'Client Secret', type: 'password', onChange: (v) => updateCredentials(['google', 'clientSecret'], v) },
                { label: 'Refresh Token', value: credentials.google?.refreshToken || '', placeholder: 'Refresh Token', type: 'password', onChange: (v) => updateCredentials(['google', 'refreshToken'], v) },
              ]}
              note="Create project at console.cloud.google.com → Enable Photos Library API → Create OAuth credentials. Set redirect URI to http://127.0.0.1:5173/google-callback"
            />

            {/* Google Maps */}
            <CredentialCard
              title="Google Maps"
              status={(credentials as any).googleMaps?.apiKey ? 'configured' : 'not set'}
              fields={[
                { label: 'API Key', value: (credentials as any).googleMaps?.apiKey || '', placeholder: 'Maps API Key', type: 'password', onChange: (v) => updateCredentials(['googleMaps', 'apiKey'], v) },
              ]}
              note="Get API key at console.cloud.google.com → Enable Distance Matrix API → Create API Key"
            />

            {/* iCloud */}
            <CredentialCard
              title="iCloud Photos"
              status={(credentials as any).icloud?.sharedAlbumUrl ? 'configured' : 'not set'}
              fields={[
                { label: 'Shared Album URL', value: (credentials as any).icloud?.sharedAlbumUrl || '', placeholder: 'https://www.icloud.com/sharedalbum/#...', onChange: (v) => updateCredentials(['icloud', 'sharedAlbumUrl'], v) },
              ]}
              note="In Photos app: create a Shared Album → enable Public Website in sharing options → copy the link"
            />

            {/* Calendar */}
            <CredentialCard
              title="Calendar (iCal)"
              status={(credentials as any).calendar?.sources?.length ? `${(credentials as any).calendar.sources.length} source(s)` : 'not set'}
              fields={[]}
              note="Google Calendar: Settings → calendar → Secret address in iCal format. Outlook: Settings → View all Outlook settings → Calendar → Shared calendars → Publish"
            />

            {/* Todoist */}
            <CredentialCard
              title="Todoist"
              status={(credentials as any).todoist?.apiToken ? 'configured' : 'not set'}
              fields={[
                { label: 'API Token', value: (credentials as any).todoist?.apiToken || '', placeholder: 'From todoist.com/prefs/integrations', type: 'password', onChange: (v) => updateCredentials(['todoist', 'apiToken'], v) },
              ]}
              note="Get API token at todoist.com → Settings → Integrations → Developer → API token"
            />

            {/* Microsoft */}
            <CredentialCard
              title="Microsoft (To Do)"
              status={(credentials as any).microsoft?.refreshToken ? 'configured' : 'not set'}
              fields={[
                { label: 'Client ID', value: (credentials as any).microsoft?.clientId || '', placeholder: 'Azure AD Client ID', onChange: (v) => updateCredentials(['microsoft', 'clientId'], v) },
                { label: 'Client Secret', value: (credentials as any).microsoft?.clientSecret || '', placeholder: 'Client Secret', type: 'password', onChange: (v) => updateCredentials(['microsoft', 'clientSecret'], v) },
                { label: 'Refresh Token', value: (credentials as any).microsoft?.refreshToken || '', placeholder: 'Refresh Token', type: 'password', onChange: (v) => updateCredentials(['microsoft', 'refreshToken'], v) },
              ]}
              note="Register app at portal.azure.com → Azure AD → App registrations. Set redirect URI to http://127.0.0.1:5173/microsoft-callback. Add Tasks.ReadWrite permission."
            />

            {/* Google Tasks */}
            <CredentialCard
              title="Google Tasks"
              status={(credentials as any).googleTasks?.refreshToken ? 'configured' : 'not set'}
              fields={[
                { label: 'Client ID', value: (credentials as any).googleTasks?.clientId || '', placeholder: 'Google Client ID', onChange: (v) => updateCredentials(['googleTasks', 'clientId'], v) },
                { label: 'Client Secret', value: (credentials as any).googleTasks?.clientSecret || '', placeholder: 'Client Secret', type: 'password', onChange: (v) => updateCredentials(['googleTasks', 'clientSecret'], v) },
                { label: 'Refresh Token', value: (credentials as any).googleTasks?.refreshToken || '', placeholder: 'Refresh Token', type: 'password', onChange: (v) => updateCredentials(['googleTasks', 'refreshToken'], v) },
              ]}
              note="Same Google Cloud project as Photos. Enable Tasks API. Use same OAuth credentials with tasks scope."
            />

            {/* YouTube */}
            <CredentialCard
              title="YouTube"
              status={(credentials as any).youtube?.apiKey ? 'configured' : 'not set'}
              fields={[
                { label: 'API Key', value: (credentials as any).youtube?.apiKey || '', placeholder: 'YouTube Data API v3 Key', type: 'password', onChange: (v) => updateCredentials(['youtube', 'apiKey'], v) },
              ]}
              note="console.cloud.google.com → Enable YouTube Data API v3 → Create API Key (no OAuth needed)"
            />

            {/* Plex */}
            <CredentialCard
              title="Plex"
              status={(credentials as any).plex?.token ? 'configured' : 'not set'}
              fields={[
                { label: 'Server URL', value: (credentials as any).plex?.serverUrl || '', placeholder: 'http://plex.local:32400', onChange: (v) => updateCredentials(['plex', 'serverUrl'], v) },
                { label: 'Token', value: (credentials as any).plex?.token || '', placeholder: 'X-Plex-Token', type: 'password', onChange: (v) => updateCredentials(['plex', 'token'], v) },
              ]}
              note="Find your token: open Plex Web → inspect any API request → copy X-Plex-Token from the URL"
            />

            {/* Jellyfin */}
            <CredentialCard
              title="Jellyfin"
              status={(credentials as any).jellyfin?.apiKey ? 'configured' : 'not set'}
              fields={[
                { label: 'Server URL', value: (credentials as any).jellyfin?.serverUrl || '', placeholder: 'http://jellyfin.local:8096', onChange: (v) => updateCredentials(['jellyfin', 'serverUrl'], v) },
                { label: 'API Key', value: (credentials as any).jellyfin?.apiKey || '', placeholder: 'Jellyfin API Key', type: 'password', onChange: (v) => updateCredentials(['jellyfin', 'apiKey'], v) },
                { label: 'User ID', value: (credentials as any).jellyfin?.userId || '', placeholder: 'Jellyfin User ID', onChange: (v) => updateCredentials(['jellyfin', 'userId'], v) },
              ]}
              note="Dashboard → API Keys → Create. User ID: Dashboard → Users → click user → copy ID from URL"
            />

            {/* Immich */}
            <CredentialCard
              title="Immich"
              status={(credentials as any).immich?.apiKey ? 'configured' : 'not set'}
              fields={[
                { label: 'Server URL', value: (credentials as any).immich?.serverUrl || '', placeholder: 'http://immich.local:2283', onChange: (v) => updateCredentials(['immich', 'serverUrl'], v) },
                { label: 'API Key', value: (credentials as any).immich?.apiKey || '', placeholder: 'Immich API Key', type: 'password', onChange: (v) => updateCredentials(['immich', 'apiKey'], v) },
              ]}
              note="User Settings → API Keys → Create New API Key"
            />

            {/* Custom credentials */}
            {Object.entries(credentials as any).filter(([k]) =>
              !['homeAssistant', 'spotify', 'google', 'googleMaps', 'icloud', 'calendar', 'todoist', 'microsoft', 'googleTasks', 'youtube', 'plex', 'jellyfin', 'immich'].includes(k)
            ).map(([key, value]) => (
              <CredentialCard
                key={key}
                title={key}
                status="custom"
                fields={Object.entries(value as Record<string, string>).map(([field, val]) => ({
                  label: field,
                  value: val || '',
                  placeholder: field,
                  onChange: (v: string) => updateCredentials([key, field], v),
                }))}
                onDelete={() => {
                  const next = { ...credentials } as any
                  delete next[key]
                  setCredentials(next)
                }}
              />
            ))}

            {/* Add new credential */}
            <AddCredentialCard existingKeys={Object.keys(credentials)} onAdd={(name, fields) => {
              const next = { ...credentials } as any
              next[name] = fields
              setCredentials(next)
            }} />
          </div>
        </section>

        {/* Device Assignments Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-200">Device Assignments</h2>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Device</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Dashboard</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">URL</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(devices).map(([deviceName, assignedDashboard]) => (
                  <tr key={deviceName} className="border-b border-gray-700/50">
                    <td className="px-4 py-3 text-white font-medium">{deviceName}</td>
                    <td className="px-4 py-3">
                      <select
                        value={assignedDashboard}
                        onChange={e => handleDeviceAssign(deviceName, e.target.value)}
                        className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white focus:outline-none"
                      >
                        {dashboards.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded select-all">
                        {getDeviceUrl(deviceName)}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemoveDevice(deviceName)}
                        className="px-2 py-1 bg-red-700/50 hover:bg-red-600 rounded text-xs transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {Object.keys(devices).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      No devices registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add Device */}
          <div className="mt-4 flex gap-3">
            <input
              type="text"
              value={newDeviceName}
              onChange={e => setNewDeviceName(e.target.value)}
              placeholder="Device name (e.g. pi-kitchen)"
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && handleAddDevice()}
            />
            <button
              onClick={handleAddDevice}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
            >
              Add Device
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

// --- Credential Card Component ---

interface CredentialField {
  label: string
  value: string
  placeholder: string
  type?: string
  onChange: (value: string) => void
}

function CredentialCard({ title, status, fields, note, onDelete }: {
  title: string
  status: string
  fields: CredentialField[]
  note?: string
  onDelete?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isConfigured = status !== 'not set'

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-750 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-gray-500'}`} />
          <span className="text-sm font-medium text-gray-200">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{status}</span>
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1 text-gray-500 hover:text-red-400 transition-colors"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700 pt-2">
          {fields.map(field => (
            <div key={field.label}>
              <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
              <input
                type={field.type || 'text'}
                value={field.value}
                onChange={e => field.onChange(e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
          {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
        </div>
      )}
    </div>
  )
}

const CREDENTIAL_TEMPLATES: Array<{
  key: string
  label: string
  fields: Array<{ key: string; label: string; type?: string; placeholder: string }>
}> = [
  {
    key: 'homeAssistant',
    label: 'Home Assistant',
    fields: [
      { key: 'url', label: 'URL', placeholder: 'http://homeassistant.local:8123' },
      { key: 'token', label: 'Long-Lived Access Token', type: 'password', placeholder: 'HA access token' },
    ],
  },
  {
    key: 'spotify',
    label: 'Spotify',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Spotify Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Spotify Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', placeholder: 'Spotify Refresh Token' },
    ],
  },
  {
    key: 'google',
    label: 'Google Photos',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Google Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Google Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', placeholder: 'Google Refresh Token' },
    ],
  },
  {
    key: 'googleMaps',
    label: 'Google Maps',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Google Maps API Key' },
    ],
  },
  {
    key: 'icloud',
    label: 'iCloud Photos',
    fields: [
      { key: 'sharedAlbumUrl', label: 'Shared Album URL', placeholder: 'https://www.icloud.com/sharedalbum/#...' },
    ],
  },
  {
    key: 'calendar',
    label: 'Calendar (iCal)',
    fields: [
      { key: 'url', label: 'iCal URL', placeholder: 'https://calendar.google.com/calendar/ical/...' },
      { key: 'name', label: 'Calendar Name', placeholder: 'My Calendar' },
    ],
  },
  {
    key: 'todoist',
    label: 'Todoist',
    fields: [
      { key: 'apiToken', label: 'API Token', type: 'password', placeholder: 'From todoist.com/prefs/integrations' },
    ],
  },
  {
    key: 'microsoft',
    label: 'Microsoft (To Do / Azure AD)',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Azure AD Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Azure AD Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', placeholder: 'Microsoft Refresh Token' },
    ],
  },
  {
    key: 'googleTasks',
    label: 'Google Tasks',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Google Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Google Client Secret' },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', placeholder: 'Google Refresh Token' },
    ],
  },
  {
    key: 'youtube',
    label: 'YouTube',
    fields: [
      { key: 'apiKey', label: 'Data API v3 Key', type: 'password', placeholder: 'YouTube API Key' },
    ],
  },
  {
    key: 'plex',
    label: 'Plex',
    fields: [
      { key: 'serverUrl', label: 'Server URL', placeholder: 'http://plex.local:32400' },
      { key: 'token', label: 'X-Plex-Token', type: 'password', placeholder: 'Plex token' },
    ],
  },
  {
    key: 'jellyfin',
    label: 'Jellyfin',
    fields: [
      { key: 'serverUrl', label: 'Server URL', placeholder: 'http://jellyfin.local:8096' },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Jellyfin API Key' },
      { key: 'userId', label: 'User ID', placeholder: 'Jellyfin User ID' },
    ],
  },
  {
    key: 'immich',
    label: 'Immich',
    fields: [
      { key: 'serverUrl', label: 'Server URL', placeholder: 'http://immich.local:2283' },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Immich API Key' },
    ],
  },
]

function AddCredentialCard({ onAdd, existingKeys }: {
  onAdd: (name: string, fields: Record<string, string>) => void
  existingKeys: string[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [customName, setCustomName] = useState('')
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([{ key: '', value: '' }])

  // Filter out already-added credential types
  const availableTemplates = CREDENTIAL_TEMPLATES.filter(t => !existingKeys.includes(t.key))
  const selectedTemplate = CREDENTIAL_TEMPLATES.find(t => t.key === selected)

  function handleAdd() {
    if (selected === 'custom') {
      if (!customName.trim()) return
      const fields: Record<string, string> = {}
      for (const entry of customFields) {
        if (entry.key.trim()) fields[entry.key.trim()] = entry.value
      }
      onAdd(customName.trim(), fields)
    } else if (selectedTemplate) {
      onAdd(selectedTemplate.key, fieldValues)
    }
    setSelected('')
    setFieldValues({})
    setCustomName('')
    setCustomFields([{ key: '', value: '' }])
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-gray-800 rounded-lg border border-dashed border-gray-600 p-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors w-full"
      >
        + Add Credential
      </button>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3 space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Service Type</label>
        <select
          value={selected}
          onChange={e => { setSelected(e.target.value); setFieldValues({}) }}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Select a service...</option>
          {availableTemplates.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
          <option value="custom">Custom...</option>
        </select>
      </div>

      {/* Templated fields */}
      {selectedTemplate && (
        <div className="space-y-2">
          {selectedTemplate.fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
              <input
                type={field.type || 'text'}
                value={fieldValues[field.key] || ''}
                onChange={e => setFieldValues({ ...fieldValues, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Custom fields */}
      {selected === 'custom' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Service Name</label>
            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="e.g., MyService"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          {customFields.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text" value={entry.key}
                onChange={e => { const next = [...customFields]; next[i] = { ...next[i], key: e.target.value }; setCustomFields(next) }}
                placeholder="Field name"
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text" value={entry.value}
                onChange={e => { const next = [...customFields]; next[i] = { ...next[i], value: e.target.value }; setCustomFields(next) }}
                placeholder="Value"
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
          <button onClick={() => setCustomFields([...customFields, { key: '', value: '' }])} className="text-xs text-gray-400 hover:text-gray-200">+ Add field</button>
        </div>
      )}

      {selected && (
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setOpen(false); setSelected('') }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs">Cancel</button>
          <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium">Add</button>
        </div>
      )}
    </div>
  )
}
