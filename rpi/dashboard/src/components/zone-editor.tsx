import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { useConfig } from '@/config/config-provider'
import { registry } from '@/widgets/registry'
import { zoneTemplates, getTemplate } from '@/config/zone-templates'
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

  const selectedTemplate = getTemplate(selectedTemplateId)
  const widgetTypes = Array.from(registry.entries()).map(([type, def]) => ({
    type,
    name: def.name,
  }))

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId)
    // Reset zones when template changes (keep any that match region IDs)
    const template = getTemplate(templateId)
    if (template) {
      const newZones: ZoneInstance[] = template.regions.map(region => {
        const existing = zones.find(z => z.regionId === region.id)
        return existing || { regionId: region.id, widgetType: '', widgetConfig: {} }
      })
      setZones(newZones)
    }
  }

  function handleWidgetAssign(regionId: string, widgetType: string) {
    setZones(prev => {
      const existing = prev.find(z => z.regionId === regionId)
      if (existing) {
        return prev.map(z => z.regionId === regionId ? { ...z, widgetType, widgetConfig: {} } : z)
      }
      return [...prev, { regionId, widgetType, widgetConfig: {} }]
    })
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-lg h-full bg-[var(--background)] border-l border-[var(--border)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--background)] z-10">
          <h2 className="text-lg font-medium">Zone Layout Editor</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              <Check size={16} />
              Save
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Template Picker */}
          <section>
            <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Choose Template</h3>
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
                  {/* Mini layout preview */}
                  <TemplatePreview template={template} />
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

          {/* Region Widget Assignment */}
          {selectedTemplate && (
            <section>
              <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Assign Widgets to Regions</h3>
              <div className="space-y-3">
                {selectedTemplate.regions.map(region => {
                  const zone = zones.find(z => z.regionId === region.id)
                  return (
                    <div key={region.id} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
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
                  )
                })}
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
                type="range"
                min={0}
                max={90}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Lower values show more of the background photo. Zone panels have their own transparency.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Simple CSS-drawn layout diagram for template preview */
function TemplatePreview({ template }: { template: { id: string; regions: ZoneRegion[] } }) {
  return (
    <div className="relative w-full h-16 rounded bg-[var(--muted)] overflow-hidden">
      {template.regions.map(region => {
        const style = getPreviewStyle(region)
        return (
          <div
            key={region.id}
            className="absolute bg-[var(--primary)]/30 border border-[var(--primary)]/50"
            style={style}
          />
        )
      })}
    </div>
  )
}

function getPreviewStyle(region: ZoneRegion): React.CSSProperties {
  const style: React.CSSProperties = { position: 'absolute' }

  // Convert region CSS values to simplified preview positioning
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

  // Defaults for auto-sized
  if (!style.width) style.width = '30%'
  if (!style.height && !style.bottom && !style.top) style.height = '20%'

  return style
}

function simplifyValue(val: string, _max: number): string {
  if (val.includes('%')) return val
  if (val.includes('calc')) return '4%'
  // Convert px to percentage-ish for preview
  const px = parseInt(val)
  if (!isNaN(px)) return `${Math.max(2, Math.round((px / _max) * 100))}%`
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
