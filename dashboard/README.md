# Grumpy Dashboard (Phase 3)

React + Tailwind web app that runs in Chromium kiosk on the Pi.

**Not yet implemented.** Phases 1-2 (backend) come first. See
[`../CLAUDE.md`](../CLAUDE.md) for the Phase 3 plan.

## Planned Stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- `home-assistant-js-websocket` for HA integration
- Widget-grid layout, config-driven

## Planned Widgets

- Clock + date
- Weather (Open-Meteo)
- Calendar (CalDAV)
- Photos (Immich API or local folder)
- Home Assistant entity cards
- Voice interaction surface (added in Phase 5)

## Development

Developed on Jason's workstation against the real HA VM via WebSocket.
No Pi involvement during development — Chromium on a desktop renders
identically to Chromium on the Pi.
