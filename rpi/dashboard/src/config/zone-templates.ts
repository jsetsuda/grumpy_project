import type { ZoneTemplate } from './zone-types'

// Zone templates — zero border/gap between sections, no background cards by default.
// Seamless edge-to-edge panels that tile the screen.

export const zoneTemplates: ZoneTemplate[] = [
  {
    id: 'full-overlay',
    name: 'Full Overlay',
    description: 'Photo background with info overlaid in corners and a side panel',
    regions: [
      { id: 'top-left', name: 'Top Left (Clock)', top: '0', left: '0', width: 'auto', height: 'auto', padding: '16px 24px' },
      { id: 'top-right', name: 'Top Right (Weather)', top: '0', right: '0', width: 'auto', height: 'auto', padding: '16px 24px' },
      { id: 'left-panel', name: 'Left Panel (Calendar)', top: '60px', left: '0', width: '30%', bottom: '0', padding: '16px', overflow: 'auto' },
      { id: 'bottom-right', name: 'Bottom Right (Info)', bottom: '0', right: '0', width: '280px', height: 'auto', padding: '16px' },
    ],
  },
  {
    id: 'dakboard-classic',
    name: 'DAKboard Classic',
    description: 'Large calendar with news sidebar — seamless edge-to-edge',
    regions: [
      { id: 'main-calendar', name: 'Main Area (Calendar)', top: '0', left: '0', width: '70%', height: '100%', padding: '16px', overflow: 'auto' },
      { id: 'right-sidebar', name: 'Right Sidebar (News)', top: '0', right: '0', width: '30%', bottom: '0', padding: '16px', overflow: 'auto' },
    ],
  },
  {
    id: 'agenda-focus',
    name: 'Agenda Focus',
    description: 'Three-column: news / calendar / todo — seamless panels',
    regions: [
      { id: 'top-bar', name: 'Top Bar (Clock + Weather)', top: '0', left: '0', width: '100%', height: '60px', padding: '12px 24px' },
      { id: 'left-news', name: 'Left Column (News)', top: '60px', left: '0', width: '25%', bottom: '0', padding: '12px', overflow: 'auto' },
      { id: 'center-calendar', name: 'Center (Calendar)', top: '60px', left: '25%', width: '50%', bottom: '0', padding: '16px', overflow: 'auto' },
      { id: 'right-info', name: 'Right Column (Todo)', top: '60px', right: '0', width: '25%', bottom: '0', padding: '12px', overflow: 'auto' },
    ],
  },
  {
    id: 'left-panel',
    name: 'Left Panel',
    description: 'Info panel on left, photo visible on right',
    regions: [
      { id: 'left-panel', name: 'Left Panel', top: '0', left: '0', width: '40%', height: '100%', padding: '20px', overflow: 'auto' },
      { id: 'top-right', name: 'Top Right (Weather)', top: '0', right: '0', width: 'auto', height: 'auto', padding: '16px 24px' },
    ],
  },
  {
    id: 'split',
    name: 'Split',
    description: '50/50 — calendar on left, widgets on right',
    regions: [
      { id: 'left-half', name: 'Left Half (Calendar)', top: '0', left: '0', width: '50%', height: '100%', padding: '20px', overflow: 'auto' },
      { id: 'right-half', name: 'Right Half (Widgets)', top: '0', right: '0', width: '50%', height: '100%', padding: '20px', overflow: 'auto' },
    ],
  },
  {
    id: 'family-hub',
    name: 'Family Hub',
    description: 'Calendar + grocery + news + countdown — family command center',
    regions: [
      { id: 'header', name: 'Header (Clock + Weather)', top: '0', left: '0', width: '100%', height: '60px', padding: '12px 24px' },
      { id: 'calendar-panel', name: 'Calendar (Left)', top: '60px', left: '0', width: '40%', bottom: '0', padding: '12px', overflow: 'auto' },
      { id: 'top-right-panel', name: 'Top Right (Todo/Grocery)', top: '60px', left: '40%', width: '30%', height: '50%', padding: '12px', overflow: 'auto' },
      { id: 'bottom-right-panel', name: 'Bottom Right (News)', bottom: '0', left: '40%', width: '30%', height: 'calc(50% - 30px)', padding: '12px', overflow: 'auto' },
      { id: 'far-right', name: 'Far Right (Countdown)', top: '60px', right: '0', width: '30%', bottom: '0', padding: '12px', overflow: 'auto' },
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just clock and one widget — rest is photos',
    regions: [
      { id: 'center-top', name: 'Center Top (Clock)', top: '24px', left: '50%', width: 'auto', height: 'auto', padding: '16px 32px' },
      { id: 'bottom-center', name: 'Bottom Center (Info)', bottom: '24px', left: '50%', width: '320px', height: 'auto', padding: '16px 24px' },
    ],
  },
]

export function getTemplate(id: string): ZoneTemplate | undefined {
  return zoneTemplates.find(t => t.id === id)
}

// Default widget assignments per template
export const templatePresets: Record<string, Record<string, string>> = {
  'full-overlay': { 'top-left': 'clock', 'top-right': 'weather', 'left-panel': 'calendar', 'bottom-right': 'todo' },
  'dakboard-classic': { 'main-calendar': 'calendar', 'right-sidebar': 'news' },
  'agenda-focus': { 'top-bar': 'clock', 'left-news': 'news', 'center-calendar': 'calendar', 'right-info': 'todo' },
  'left-panel': { 'left-panel': 'calendar', 'top-right': 'weather' },
  'split': { 'left-half': 'calendar', 'right-half': 'ha-entities' },
  'family-hub': { 'header': 'clock', 'calendar-panel': 'calendar', 'top-right-panel': 'grocery', 'bottom-right-panel': 'news', 'far-right': 'countdown' },
  'minimal': { 'center-top': 'clock', 'bottom-center': 'weather' },
}

// Custom template — empty, user places their own zones
export const customTemplate: ZoneTemplate = {
  id: 'custom',
  name: 'Custom',
  description: 'Place and size your own widgets freely on the screen',
  regions: [],
}

zoneTemplates.push(customTemplate)
