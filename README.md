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
   protocol (Wyoming, WebSocket, HTTP) so any component can be swapped.
4. **Built on Home Assistant.** Don't reinvent device integrations —
   lean on HA for what HA does well and build the UX layer on top.

---

## System Architecture

Grumpy spans three machines. Each has a specific, limited role.

```
┌───────────────────────┐           ┌──────────────────────────┐
│  Raspberry Pi 4 / 5   │           │  Home Assistant VM       │
│  ──────────────────   │           │  ──────────────────────  │
│  Chromium kiosk       │◄─────────►│  HA core                 │
│  React dashboard      │ WebSocket │  Assist pipeline         │
│  Mic + speakers       │ + Assist  │  Device integrations     │
│                       │  API      │  Wyoming integrations ───┼──┐
│  "pi-client/"         │           │                          │  │
│  "dashboard/"         │           │  (existing VM,           │  │
│                       │           │   not in this repo)      │  │
└───────────────────────┘           └──────────────────────────┘  │
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
                                    │    Ollama      (GPU) P2  │  :11434
                                    │                          │
                                    │  "backend/"              │
                                    └──────────────────────────┘
```

### Machine Roles

**Raspberry Pi (4 or 5)** — *the display and I/O endpoint*
- Runs Raspberry Pi OS Desktop in kiosk mode
- Chromium fullscreen displays the React dashboard
- USB microphone captures voice for the Assist pipeline
- USB or HDMI speakers play TTS responses
- Holds no state. Replaceable. Identical codebase on Pi 4 and Pi 5.

**Home Assistant VM** — *the orchestrator* (already running; not in this repo)
- Knows about every device, entity, and automation
- Runs the Assist pipeline that stitches wake → STT → intent → TTS
- Talks to the Grumpy backend via the Wyoming Protocol integration
- Exposes everything the dashboard needs over WebSocket API
- Stays authoritative for all device state

**Grumpy Backend VM** — *the brain* (this repo's `backend/`)
- Runs on Proxmox with **RTX 3090 GPU passthrough**
- Hosts the voice AI stack as Docker containers
- Later hosts Ollama for local LLM conversation
- Never talks to the Pi directly — HA mediates everything

### What Connects to What

| From | To | Protocol | Purpose |
|------|-----|---------|---------|
| Pi dashboard | HA VM | WebSocket (8123) | Entity state, service calls, Assist events |
| Pi microphone | HA VM | Assist pipeline | Voice input for processing |
| HA VM | Backend VM | Wyoming (10200) | Piper TTS requests |
| HA VM | Backend VM | Wyoming (10300) | Whisper STT requests |
| HA VM | Backend VM | Wyoming (10400) | openWakeWord detection |
| HA VM | Backend VM | HTTP (11434) | Ollama LLM conversation (Phase 2) |
| HA VM | Anthropic API | HTTPS | Claude cloud fallback (Phase 2) |

The Pi never speaks directly to the backend VM. This is deliberate —
HA is always in the loop so it can apply policy, log, and route.

---

## Repo Layout

Organized by machine — clone the repo anywhere, work in the directory for
the machine you're on.

```
grumpy/
├── README.md              This file — overall project scope
├── CLAUDE.md              Context and conventions for AI agents
├── backend/               Backend VM: voice stack + LLM services
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── manage.sh
│   └── README.md
├── homeassistant/         HA VM: integration configs, blueprints, automations
│   └── README.md
├── rpi/                   Raspberry Pi: dashboard app + kiosk provisioning
│   └── README.md
└── docs/                  Architecture diagrams, decision records, runbooks
```

---

## Implementation Phases

Each phase produces something working end-to-end before moving on. No
big-bang integration at the end.

### Phase 1 — Voice Stack Backend &nbsp;&nbsp;`backend/`
Deploy Wyoming Whisper + Piper + openWakeWord on the backend VM. Wire
into the HA VM's Assist pipeline. Validate by talking to HA through the
companion app on a phone.

**Done when:** Voice command in the HA companion app gets transcribed,
handled, and the TTS response plays back. The Pi is not involved yet.

### Phase 2 — LLM Conversation Agents &nbsp;&nbsp;`backend/`
Add Ollama to the backend VM's compose stack (shares the 3090 with
Whisper — plenty of VRAM). Register it in HA as a conversation agent.
Add the Anthropic integration for cloud fallback. Configure the Assist
pipeline to route general-knowledge queries to Ollama, with Claude as
a fallback or per-pipeline option.

**Done when:** "What's the capital of Portugal?" routes through HA's
conversation agent and gets answered by Ollama (or Claude if selected).

### Phase 2.5 — Custom "Hey Grumpy" Wake Word &nbsp;&nbsp;`backend/`
Optional but fun. Train a custom openWakeWord model, drop into
`backend/data/openwakeword/`, update the Assist pipeline.

### Phase 3 — Dashboard Web App &nbsp;&nbsp;`dashboard/`
React + Tailwind + shadcn/ui, built with Vite. Widget grid layout.
Connects to the HA VM's WebSocket API for state and service calls.
Core widgets:
- Clock + date
- Weather (Open-Meteo, no API key)
- Calendar (CalDAV)
- Photo rotation (local folder or Immich API)
- Home Assistant entity cards (lights, climate, cameras)
- Voice interaction surface (wake indicator, transcript, response)

Developed entirely on Jason's workstation against the real HA VM. No
Pi involvement during development.

**Done when:** Dashboard runs in a desktop browser, shows live HA
state, service calls work (tap a light, it turns on).

### Phase 4 — Pi Deployment &nbsp;&nbsp;`pi-client/`
Flash Raspberry Pi OS, install kiosk dependencies, autostart Chromium
pointed at the dashboard URL. Tune for the chosen touchscreen
(resolution, orientation, touch calibration). Test on both Pi 4 and
Pi 5.

**Done when:** Pi boots directly into the dashboard, touch works,
dashboard is identical across Pi 4 and Pi 5.

### Phase 5 — Voice UI in the Dashboard &nbsp;&nbsp;`dashboard/` + `pi-client/`
Wire the Pi's microphone into the HA Assist pipeline. Add visual
feedback in the dashboard: wake word indicator, live transcript,
response display, quiet-listening state.

**Done when:** "Hey Grumpy, turn off the kitchen lights" from across
the room works end-to-end — Pi captures audio, HA processes via the
backend stack, lights turn off, dashboard shows the interaction.

---

## Starting Point

Start with [`backend/README.md`](./backend/README.md). It has the
Phase 1 deployment steps: prereqs, GPU setup, `docker compose up`,
and HA wiring.

## Status

| Phase | Status |
|-------|--------|
| 1. Voice stack backend | 🟢 Scaffolded, ready to deploy |
| 2. LLM conversation agents | ⬜ Planned |
| 2.5. Custom wake word | ⬜ Optional |
| 3. Dashboard web app | ⬜ Planned |
| 4. Pi deployment | ⬜ Planned |
| 5. Voice UI integration | ⬜ Planned |
