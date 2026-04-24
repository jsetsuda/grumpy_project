# Grumpy

A self-hosted smart home hub. A Raspberry Pi touchscreen runs a
Dakboard-style dashboard with full Home Assistant integration and a
local-first voice AI that replaces Alexa/Google Home.

This is the monorepo for all components of the system.

> **Working on this with Claude Code or another AI agent?** Read
> [`CLAUDE.md`](./CLAUDE.md) first. It has the architectural context,
> invariants, and working conventions the agent needs.

## The Problem This Solves

Commercial smart displays (Echo Show, Google Nest Hub) are closed,
cloud-dependent, and surveillance-heavy. Dakboard is pretty but
passive — it's read-only. Home Assistant has Assist, but the default
setup doesn't give you a beautiful always-on display. Grumpy combines
the three: a beautiful always-on touchscreen, full home control, and a
voice assistant that runs on your own hardware.

Design principles:
1. **Local-first.** Voice, LLM, and state all run on Jason's own
   infrastructure. Cloud APIs are an optional fallback, not a default.
2. **The Pi is a thin client.** All compute lives on the backend VM.
   The Pi is replaceable; work on Pi 4 and Pi 5 without code changes.
3. **Composable, not monolithic.** Each layer talks over a well-known
   protocol (Wyoming, ESPHome native API, WebSocket, HTTP) so any
   component can be swapped.
4. **Built on Home Assistant.** Don't reinvent device integrations —
   lean on HA for what HA does well and build the UX layer on top.

---

## System Architecture

Grumpy spans three machines. Each has a specific, limited role.

```
┌────────────────────────────┐         ┌──────────────────────────┐
│  Raspberry Pi 4 / 5        │         │  Home Assistant VM       │
│  ────────────────────────  │         │  ──────────────────────  │
│  Chromium kiosk (Docker)   │◄───────►│  HA core                 │
│  React dashboard           │WebSocket│  Assist pipeline         │
│  linux-voice-assistant ────┼─ESPHome─►  ESPHome integration     │
│  librespot (Spotify Connect)│ :6053   │  Music Assistant addon  │
│  Mic + speakers (PipeWire) │         │  Wyoming integrations ───┼──┐
│                            │         │                          │  │
│  "rpi/kiosk/"              │         │  (existing VM,           │  │
│  "rpi/dashboard/" (opt)    │         │   not in this repo)      │  │
│  "rpi/linux-voice-assistant/"│       │                          │  │
│  "rpi/librespot/"          │         │                          │  │
└────────────────────────────┘         └──────────────────────────┘  │
                                                                     │
                                                                     │ Wyoming
                                                                     │ protocol
                                                                     │
                                       ┌──────────────────────────┐  │
                                       │  Grumpy Backend VM       │◄─┘
                                       │  ──────────────────────  │
                                       │  RTX 3090 passthrough    │
                                       │  Docker Compose stack:   │
                                       │                          │
                                       │    Whisper     (GPU)     │  :10300
                                       │    Piper       (CPU)     │  :10200
                                       │    openWakeWord (CPU)    │  :10400
                                       │    Ollama      (GPU)     │  :11434
                                       │    Dashboard   (Vite)    │  :5173
                                       │                          │
                                       │  "backend/"              │
                                       │  "rpi/dashboard/"        │
                                       └──────────────────────────┘
```

### Machine Roles

**Raspberry Pi (4 or 5)** — *the display and I/O endpoint*
- Raspberry Pi OS Bookworm Desktop with PipeWire audio
- Chromium fullscreen (Docker container managed by systemd; auto
  restarts every 12 h to clear memory leaks)
- `linux-voice-assistant` advertises a wake-word satellite over the
  ESPHome native API (HA pairs with it like any ESPHome device)
- `librespot` registers the Pi as a native Spotify Connect target
  (Chromium on Pi OS lacks Widevine, so Web Playback SDK can't)
- USB or HDMI speakers play TTS, music, and timer/alarm tones
- Identical codebase on Pi 4 and Pi 5

**Home Assistant VM** — *the orchestrator* (already running; not in this repo)
- Knows about every device, entity, and automation
- Runs the Assist pipeline that stitches wake → STT → intent → TTS
- Pairs with the Pi's `linux-voice-assistant` via the ESPHome
  integration; pairs with the Backend VM via Wyoming
- Runs the Music Assistant addon for unified Spotify/Apple Music/etc.
- Exposes everything the dashboard needs over WebSocket API
- Stays authoritative for all device state

**Grumpy Backend VM** — *the brain* (this repo's `backend/`)
- Runs on Proxmox with **RTX 3090 GPU passthrough**
- Hosts the voice AI stack as Docker containers
- Hosts Ollama for local LLM conversation
- Usually serves the dashboard over HTTPS on `:5173` so all Pis can
  load the same instance (per-Pi local dashboard server is optional)
- Never talks to the Pi directly — HA mediates everything voice-related

### What Connects to What

| From | To | Protocol | Purpose |
|------|-----|---------|---------|
| Pi Chromium | Backend VM | HTTPS (5173) | Loads the dashboard SPA |
| Pi dashboard | HA VM | WebSocket (8123) | Entity state, service calls, Assist events |
| Pi `linux-voice-assistant` | HA VM | ESPHome native API (6053) | Wake-word satellite + audio I/O |
| Pi `librespot` | Spotify Cloud | HTTPS (outbound) | Spotify Connect device |
| HA VM | Backend VM | Wyoming (10200) | Piper TTS requests |
| HA VM | Backend VM | Wyoming (10300) | Whisper STT requests |
| HA VM | Backend VM | Wyoming (10400) | openWakeWord detection |
| HA VM | Backend VM | HTTP (11434) | Ollama LLM conversation |
| HA VM | Anthropic API | HTTPS | Claude cloud fallback (optional) |

The Pi never speaks directly to the Backend VM for voice. This is
deliberate — HA is always in the loop so it can apply policy, log,
and route. The dashboard SPA is the only thing the Pi loads from the
Backend VM directly.

---

## Repo Layout

Organized by machine — clone the repo anywhere, work in the directory
for the machine you're on.

```
grumpy/
├── README.md                       This file — overall project scope
├── CLAUDE.md                       Context and conventions for AI agents
├── backend/                        Backend VM: voice stack + LLM services
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── manage.sh
│   └── README.md
├── homeassistant/                  HA VM: integration notes + setup
│   └── README.md
├── rpi/                            Everything that runs on a Pi
│   ├── README.md                   Pi deployment overview
│   ├── kiosk/                      Chromium kiosk (Docker + systemd)
│   ├── linux-voice-assistant/      Wake word + voice satellite
│   ├── librespot/                  Native Spotify Connect target
│   └── dashboard/                  React dashboard (also runs on Backend VM)
└── docs/                           Architecture notes + runbooks
    ├── README.md
    ├── future_tasks.md
    └── SECRETS-ROTATION.md
```

---

## Implementation Phases

Each phase produces something working end-to-end. Phases 1-5 are
deployed; ongoing work focuses on widget polish and Echo-Show-parity
features.

### Phase 1 — Voice Stack Backend &nbsp;&nbsp;`backend/`
Deploy Wyoming Whisper + Piper + openWakeWord on the Backend VM. Wire
into the HA VM's Assist pipeline.

### Phase 2 — LLM Conversation Agents &nbsp;&nbsp;`backend/`
Ollama on the Backend VM (shares the 3090 with Whisper). Registered in
HA as a conversation agent. Anthropic integration available for cloud
fallback.

### Phase 2.5 — Custom "Hey Grumpy" Wake Word &nbsp;&nbsp;`backend/`
Optional. Uses the openWakeWord trainer; drop the model into
`backend/data/openwakeword/`.

### Phase 3 — Dashboard Web App &nbsp;&nbsp;`rpi/dashboard/`
React + TypeScript + Tailwind + Vite. Widget grid layout with
react-grid-layout. Connects to HA over WebSocket. Currently 17+
widgets including Clock, Weather, Calendar, Photos (iCloud + Immich),
Spotify (with native player + MA), Music Assistant browse, Traffic,
YouTube, Twitch, Plex/Jellyfin, HA entity cards, Grocery, Timers,
Alarms, and more.

Shared credentials live in a gitignored `credentials.json`; per-device
overrides live in `instances/<deviceId>.json`. Edited via the Manager
page (separate route from the dashboard itself).

### Phase 4 — Pi Deployment &nbsp;&nbsp;`rpi/`
Three independent services per Pi (kiosk, linux-voice-assistant,
librespot) plus an optional local dashboard server. Each subdirectory
has a `setup.sh` and its own README. Kiosk auto-restarts every 12 h
via a systemd timer.

### Phase 5 — Voice UI in the Dashboard &nbsp;&nbsp;`rpi/dashboard/`
Dashboard mic button + wake-word trigger both route through HA Assist.
Voice commands cover: timer/alarm set + cancel, Spotify control,
YouTube/Twitch search, theme switching, weather views, slideshow
control, grocery list add, streaming-service launch.

---

## Starting Point

- Setting up the **Backend VM**: start with
  [`backend/README.md`](./backend/README.md).
- Provisioning a **Raspberry Pi**: start with
  [`rpi/README.md`](./rpi/README.md) — deployment overview with
  install order, post-install checklist, and troubleshooting.
- Working on the **dashboard** itself: see
  [`rpi/dashboard/README.md`](./rpi/dashboard/README.md).

## Status

| Phase | Status |
|-------|--------|
| 1. Voice stack backend | 🟢 Deployed |
| 2. LLM conversation agents | 🟢 Deployed (Ollama + optional Claude fallback) |
| 2.5. Custom wake word | ⬜ Optional, not done |
| 3. Dashboard web app | 🟢 Deployed (17+ widgets, Manager UI, shared credentials) |
| 4. Pi deployment | 🟢 Deployed (kiosk + LVA + librespot, multiple Pis) |
| 5. Voice UI integration | 🟢 Deployed (browser mic + LVA wake-word satellite) |
