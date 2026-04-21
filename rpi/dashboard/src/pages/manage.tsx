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
  const [credentialsExpanded, setCredentialsExpanded] = useState(false)
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
              onClick={() => setCredentialsExpanded(!credentialsExpanded)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors"
            >
              {credentialsExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {credentialsExpanded && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-6">
              <p className="text-xs text-gray-400">
                These credentials are shared across all dashboards. Individual widgets can override them.
              </p>

              {/* Home Assistant */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Home Assistant</h3>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">URL</label>
                    <input
                      type="text"
                      value={credentials.homeAssistant?.url || ''}
                      onChange={e => updateCredentials(['homeAssistant', 'url'], e.target.value)}
                      placeholder="http://homeassistant.local:8123"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Long-Lived Access Token</label>
                    <input
                      type="password"
                      value={credentials.homeAssistant?.token || ''}
                      onChange={e => updateCredentials(['homeAssistant', 'token'], e.target.value)}
                      placeholder="HA access token"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Spotify */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Spotify</h3>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Client ID</label>
                    <input
                      type="text"
                      value={credentials.spotify?.clientId || ''}
                      onChange={e => updateCredentials(['spotify', 'clientId'], e.target.value)}
                      placeholder="Spotify Client ID"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Client Secret</label>
                    <input
                      type="password"
                      value={credentials.spotify?.clientSecret || ''}
                      onChange={e => updateCredentials(['spotify', 'clientSecret'], e.target.value)}
                      placeholder="Spotify Client Secret"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Refresh Token</label>
                    <input
                      type="password"
                      value={credentials.spotify?.refreshToken || ''}
                      onChange={e => updateCredentials(['spotify', 'refreshToken'], e.target.value)}
                      placeholder="Spotify Refresh Token"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Google */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Google (Photos)</h3>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Client ID</label>
                    <input
                      type="text"
                      value={credentials.google?.clientId || ''}
                      onChange={e => updateCredentials(['google', 'clientId'], e.target.value)}
                      placeholder="Google Client ID"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Client Secret</label>
                    <input
                      type="password"
                      value={credentials.google?.clientSecret || ''}
                      onChange={e => updateCredentials(['google', 'clientSecret'], e.target.value)}
                      placeholder="Google Client Secret"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Refresh Token</label>
                    <input
                      type="password"
                      value={credentials.google?.refreshToken || ''}
                      onChange={e => updateCredentials(['google', 'refreshToken'], e.target.value)}
                      placeholder="Google Refresh Token"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Google Maps */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Google Maps</h3>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">API Key</label>
                  <input
                    type="password"
                    value={credentials.googleMaps?.apiKey || ''}
                    onChange={e => updateCredentials(['googleMaps', 'apiKey'], e.target.value)}
                    placeholder="Google Maps API Key"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveCredentials}
                disabled={credentialsSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                {credentialsSaving ? 'Saving...' : 'Save Credentials'}
              </button>
            </div>
          )}
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
