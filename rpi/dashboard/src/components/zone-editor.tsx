import { useState } from 'react'
import { X, Check, Plus, Trash2, Wand2, ChevronDown, ChevronRight } from 'lucide-react'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { WidgetSettings } from './settings-panel'
import { zoneTemplates, getTemplate, templatePresets } from '@/config/zone-templates'
import type { ZoneLayoutConfig, ZoneInstance, ZoneRegion } from '@/config/zone-types'

interface ZoneEditorProps {
  open: boolean
  onClose: () => void
}

export function ZoneEditor({ open, onClose }: ZoneEditorProps) {
  const { config, updateConfig } = useConfig()
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    config.zoneLayout?.templateId || 'full-overlay'
  )
  const [zones, setZones] = useState<ZoneInstance[]>(
    config.zoneLayout?.zones || []
  )
  const [overlayOpacity, setOverlayOpacity] = useState(
    config.zoneLayout?.backgroundOverlay ?? config.backgroundOverlay ?? 40
  )

  if (!open) return null

  const isCustom = selectedTemplateId === 'custom'
  const selectedTemplate = getTemplate(selectedTemplateId)
  const widgetTypes = Array.from(registry.entries()).map(([type, def]) => ({
    type,
    name: def.name,
  }))

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId)
    if (templateId === 'custom') {
      // Keep existing zones or start empty
      if (zones.length === 0) setZones([])
      return
    }
    const template = getTemplate(templateId)
    if (template) {
      const newZones: ZoneInstance[] = template.regions.map(region => {
        const existing = zones.find(z => z.regionId === region.id)
        return existing || { regionId: region.id, widgetType: '', widgetConfig: {} }
      })
      setZones(newZones)
    }
  }

  function handleAutoAssign() {
    const preset = templatePresets[selectedTemplateId]
    if (!preset || !selectedTemplate) return
    const newZones: ZoneInstance[] = selectedTemplate.regions.map(region => ({
      regionId: region.id,
      widgetType: preset[region.id] || '',
      widgetConfig: {},
    }))
    setZones(newZones)
  }

  const [expandedZone, setExpandedZone] = useState<string | null>(null)

  function handleWidgetAssign(regionId: string, widgetType: string) {
    setZones(prev => {
      const existing = prev.find(z => z.regionId === regionId)
      if (existing) {
        return prev.map(z => z.regionId === regionId ? { ...z, widgetType, widgetConfig: {} } : z)
      }
      return [...prev, { regionId, widgetType, widgetConfig: {} }]
    })
  }

  function handleZoneConfigChange(regionId: string, partial: Partial<Record<string, unknown>>) {
    setZones(prev => prev.map(z =>
      z.regionId === regionId ? { ...z, widgetConfig: { ...z.widgetConfig, ...partial } } : z
    ))
  }

  // Custom zone management
  function addCustomZone() {
    const id = `zone-${Date.now().toString(36)}`
    setZones(prev => [...prev, {
      regionId: id,
      widgetType: '',
      widgetConfig: {},
      customRegion: {
        id,
        name: `Zone ${prev.length + 1}`,
        top: '100px',
        left: '100px',
        width: '300px',
        height: '250px',
        padding: '16px',
        background: 'rgba(0,0,0,0.4)',
        borderRadius: '16px',
      },
    }])
  }

  function removeCustomZone(regionId: string) {
    setZones(prev => prev.filter(z => z.regionId !== regionId))
  }

  function updateCustomRegion(regionId: string, field: keyof ZoneRegion, value: string) {
    setZones(prev => prev.map(z => {
      if (z.regionId !== regionId || !z.customRegion) return z
      return { ...z, customRegion: { ...z.customRegion, [field]: value } }
    }))
  }

  function updateCustomZoneName(regionId: string, name: string) {
    setZones(prev => prev.map(z => {
      if (z.regionId !== regionId || !z.customRegion) return z
      return { ...z, customRegion: { ...z.customRegion, name } }
    }))
  }

  function handleSave() {
    const layout: ZoneLayoutConfig = {
      templateId: selectedTemplateId,
      zones: zones.filter(z => z.widgetType !== ''),
      backgroundOverlay: overlayOpacity,
    }
    updateConfig({ zoneLayout: layout })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-lg h-full bg-[var(--background)] border-l border-[var(--border)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--background)] z-10">
          <h2 className="text-lg font-medium">Zone Layout Editor</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              <Check size={16} /> Save
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Template Picker */}
          <section>
            <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Choose Layout</h3>
            <div className="grid grid-cols-2 gap-3">
              {zoneTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template.id)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    selectedTemplateId === template.id
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                      : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                  }`}
                >
                  {template.id !== 'custom' && <TemplatePreview template={template} />}
                  {template.id === 'custom' && (
                    <div className="w-full h-16 rounded bg-[var(--muted)] flex items-center justify-center text-[var(--muted-foreground)]">
                      <Plus size={20} />
                    </div>
                  )}
                  <div className="mt-2 text-xs font-medium text-[var(--foreground)]">
                    {template.name}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] line-clamp-2">
                    {template.description}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Auto-Assign Button (for preset templates) */}
          {!isCustom && selectedTemplate && templatePresets[selectedTemplateId] && (
            <button
              onClick={handleAutoAssign}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] transition-colors"
            >
              <Wand2 size={16} /> Auto-Assign Recommended Widgets
            </button>
          )}

          {/* Region Widget Assignment (preset templates) */}
          {!isCustom && selectedTemplate && (
            <section>
              <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Assign Widgets</h3>
              <div className="space-y-3">
                {selectedTemplate.regions.map(region => {
                  const zone = zones.find(z => z.regionId === region.id)
                  const isExpanded = expandedZone === region.id
                  const hasWidget = zone?.widgetType && zone.widgetType !== ''
                  return (
                    <div key={region.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                      <div className="p-3">
                        <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1 block">
                          {region.name}
                        </label>
                        <select
                          value={zone?.widgetType || ''}
                          onChange={(e) => handleWidgetAssign(region.id, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm text-[var(--foreground)]"
                        >
                          <option value="">None</option>
                          {widgetTypes.map(w => (
                            <option key={w.type} value={w.type}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      {hasWidget && (
                        <>
                          <button
                            onClick={() => setExpandedZone(isExpanded ? null : region.id)}
                            className="w-full flex items-center gap-1 px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors border-t border-[var(--border)]"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Widget Settings
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3">
                              <WidgetSettings
                                widget={{ id: region.id, type: zone!.widgetType, layout: { x: 0, y: 0, w: 4, h: 4 }, config: zone!.widgetConfig }}
                                onConfigChange={(partial) => handleZoneConfigChange(region.id, partial)}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Custom Zone Editor */}
          {isCustom && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[var(--foreground)]">Custom Zones</h3>
                <button
                  onClick={addCustomZone}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--muted)] hover:bg-[var(--accent)] rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add Zone
                </button>
              </div>

              {zones.length === 0 && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  No zones yet. Add zones and position them freely on screen.
                </p>
              )}

              <div className="space-y-3">
                {zones.map(zone => (
                  <div key={zone.regionId} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={zone.customRegion?.name || zone.regionId}
                        onChange={e => updateCustomZoneName(zone.regionId, e.target.value)}
                        className="flex-1 px-2 py-1 bg-[var(--muted)] rounded text-sm text-[var(--foreground)] outline-none"
                      />
                      <button
                        onClick={() => removeCustomZone(zone.regionId)}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Widget selector */}
                    <select
                      value={zone.widgetType}
                      onChange={(e) => handleWidgetAssign(zone.regionId, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm text-[var(--foreground)]"
                    >
                      <option value="">None</option>
                      {widgetTypes.map(w => (
                        <option key={w.type} value={w.type}>{w.name}</option>
                      ))}
                    </select>

                    {/* Widget settings */}
                    {zone.widgetType && (
                      <>
                        <button
                          onClick={() => setExpandedZone(expandedZone === zone.regionId ? null : zone.regionId)}
                          className="w-full flex items-center gap-1 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        >
                          {expandedZone === zone.regionId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          Widget Settings
                        </button>
                        {expandedZone === zone.regionId && (
                          <WidgetSettings
                            widget={{ id: zone.regionId, type: zone.widgetType, layout: { x: 0, y: 0, w: 4, h: 4 }, config: zone.widgetConfig }}
                            onConfigChange={(partial) => handleZoneConfigChange(zone.regionId, partial)}
                          />
                        )}
                      </>
                    )}

                    {/* Position/Size controls */}
                    {zone.customRegion && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[var(--muted-foreground)]">Top</label>
                          <input type="text" value={zone.customRegion.top || '0'} onChange={e => updateCustomRegion(zone.regionId, 'top', e.target.value)}
                            className="w-full px-2 py-1 bg-[var(--muted)] rounded text-xs text-[var(--foreground)] outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--muted-foreground)]">Left</label>
                          <input type="text" value={zone.customRegion.left || '0'} onChange={e => updateCustomRegion(zone.regionId, 'left', e.target.value)}
                            className="w-full px-2 py-1 bg-[var(--muted)] rounded text-xs text-[var(--foreground)] outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--muted-foreground)]">Width</label>
                          <input type="text" value={zone.customRegion.width || '300px'} onChange={e => updateCustomRegion(zone.regionId, 'width', e.target.value)}
                            className="w-full px-2 py-1 bg-[var(--muted)] rounded text-xs text-[var(--foreground)] outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--muted-foreground)]">Height</label>
                          <input type="text" value={zone.customRegion.height || '250px'} onChange={e => updateCustomRegion(zone.regionId, 'height', e.target.value)}
                            className="w-full px-2 py-1 bg-[var(--muted)] rounded text-xs text-[var(--foreground)] outline-none" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Background Overlay Opacity */}
          <section>
            <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Background Overlay</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span>Photo Dimming</span>
                <span>{overlayOpacity}%</span>
              </div>
              <input
                type="range" min={0} max={90} value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function TemplatePreview({ template }: { template: { id: string; regions: ZoneRegion[] } }) {
  return (
    <div className="relative w-full h-16 rounded bg-[var(--muted)] overflow-hidden">
      {template.regions.map(region => (
        <div
          key={region.id}
          className="absolute bg-[var(--primary)]/30 border border-[var(--primary)]/50"
          style={getPreviewStyle(region)}
        />
      ))}
    </div>
  )
}

function getPreviewStyle(region: ZoneRegion): React.CSSProperties {
  const style: React.CSSProperties = { position: 'absolute' }
  if (region.top !== undefined) style.top = simplifyValue(region.top, 64)
  if (region.left !== undefined) {
    if (region.left === '50%') {
      style.left = '50%'
      style.transform = 'translateX(-50%)'
    } else {
      style.left = simplifyValue(region.left, 100)
    }
  }
  if (region.right !== undefined) style.right = simplifyValue(region.right, 100)
  if (region.bottom !== undefined) style.bottom = simplifyValue(region.bottom, 64)
  if (region.width !== undefined) style.width = simplifyWidth(region.width)
  if (region.height !== undefined) style.height = simplifyHeight(region.height)
  if (!style.width) style.width = '30%'
  if (!style.height && !style.bottom && !style.top) style.height = '20%'
  return style
}

function simplifyValue(val: string, max: number): string {
  if (val.includes('%')) return val
  if (val.includes('calc')) return '4%'
  const px = parseInt(val)
  if (!isNaN(px)) return `${Math.max(2, Math.round((px / max) * 100))}%`
  return val
}

function simplifyWidth(val: string): string {
  if (val === 'auto') return '25%'
  if (val.includes('calc')) return '46%'
  return val
}

function simplifyHeight(val: string): string {
  if (val === 'auto') return '25%'
  if (val === '100%') return '100%'
  if (val.includes('calc')) return '80%'
  const px = parseInt(val)
  if (!isNaN(px)) return `${Math.round((px / 64) * 100)}%`
  return val
}
