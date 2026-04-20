# CLAUDE.md

Context for Claude Code (or any AI coding agent) working on Grumpy.
Read this before making changes, and update it when architectural
decisions change.

## Quick Orientation

Grumpy is a self-hosted smart home hub: Raspberry Pi touchscreen
dashboard + Home Assistant integration + local voice AI. See
[`README.md`](./README.md) for the full scope; this file is
specifically about **working conventions** and **invariants** so an
agent doesn't accidentally break the architecture.

## The Three Machines

You will see references to three distinct hosts. Never conflate them.

1. **Backend VM** (this repo deploys here for Phases 1-2)
   - Ubuntu/Debian on Proxmox
   - **RTX 3090 with GPU passthrough**
   - Runs Docker + NVIDIA Container Toolkit
   - Hosts: Whisper, Piper, openWakeWord, Ollama (Phase 2)
   - Jason will place this repo somewhere like `/opt/grumpy/` or
     `~/grumpy/` on this VM

2. **Home Assistant VM** (already running, NOT in this repo)
   - Standard HA install, separate Proxmox VM
   - Acts as the orchestrator — everything routes through it
   - Connects to the Backend VM via the Wyoming Protocol integration
   - Connects to the Pi via the WebSocket API and the Assist pipeline

3. **Raspberry Pi** (Phase 4 — not yet deployed)
   - Pi 4 or Pi 5, both must work with identical code
   - Thin client: just Chromium in kiosk mode + mic + speakers
   - Never talks to the Backend VM directly — HA mediates

## Invariants (Do Not Break These)

These are load-bearing design decisions. If you think you need to
violate one, stop and ask Jason first.

- **The Pi is a thin client.** No business logic runs on it. It
  displays a dashboard and captures/plays audio. Anything more than
  that belongs on the HA VM or the Backend VM.
- **HA mediates everything.** The Pi dashboard does not call the
  Backend VM directly, ever. It talks to HA, and HA talks to the
  Backend VM. This gives us logging, policy, and a single source of
  truth.
- **Local-first, cloud optional.** Default every feature to local
  execution. Cloud (Claude API, etc.) must be an explicitly
  toggleable fallback, never required for core function.
- **Pi 4 and Pi 5 are both first-class targets.** If you add something
  that only works on the Pi 5, gate it behind a feature detection and
  provide a graceful fallback.
- **Use open protocols.** Wyoming for voice, HA's WebSocket API for
  state, HTTP for LLM. Don't invent proprietary protocols between
  our components.

## Current Phase: 1 (Voice Stack)

`backend/` contains the Phase 1 deliverables: Docker Compose with
Whisper (GPU), Piper, and openWakeWord, plus a management script.

### Phase 1 Deployment Target

The Backend VM. It must have, before `docker compose up`:
- Linux with NVIDIA drivers that see the 3090 (`nvidia-smi` works)
- Docker Engine + Compose plugin
- NVIDIA Container Toolkit configured for the Docker runtime

`backend/README.md` has the exact install commands.

### Phase 1 Done Criterion

Jason speaks into the HA companion app on his phone. HA's Assist
pipeline routes audio through our Wyoming services. TTS response
plays back through the phone. That's the whole test — the Pi is not
involved yet.

## Phase Plan

Each phase produces something working end-to-end.

### Phase 1 — Voice Stack  🟢 current
Backend VM hosts Whisper + Piper + openWakeWord. HA is wired to them.

### Phase 2 — LLM Conversation Agents  ⬜
1. Add Ollama service to `backend/docker-compose.yml`. Use GPU.
   Share the 3090 with Whisper — no conflict, 3090 has 24GB VRAM and
   Whisper `large-v3` uses ~4GB.
2. Suggested starting model: `llama3.1:8b-instruct-q5_K_M` or
   `qwen2.5:14b-instruct-q5_K_M`. Both fit comfortably.
3. In HA: add the **Ollama** integration pointing at
   `http://<backend-vm-ip>:11434`. Add it as a conversation agent in
   the Assist pipeline.
4. Also add the **Anthropic** integration in HA for Claude cloud
   fallback. Jason will supply an API key.
5. Configure the Assist pipeline so the default conversation agent
   is Ollama, with a way to switch to Claude per-command or via
   toggle.

### Phase 2.5 — Custom "Hey Grumpy" Wake Word  ⬜
1. Use openWakeWord's training tool (runs on GPU, ~30 min).
2. Drop the `.tflite` model in `backend/data/openwakeword/`.
3. Update `WAKE_WORD` in `.env`. Restart.

### Phase 3 — Dashboard  ⬜  `dashboard/`
React + Vite + Tailwind + shadcn/ui. Widget-grid layout. Connects to
HA's WebSocket API. Develop on Jason's workstation; serve the built
static files from anywhere (nginx on Backend VM is fine, or HA's
own built-in web server via a custom panel).

Key design points:
- Widget system: each widget is a self-contained React component in
  `dashboard/src/widgets/`. The grid layout is configured via JSON
  or a simple config file — user-editable without touching code.
- Core widgets: Clock, Weather (Open-Meteo, no API key), Calendar
  (CalDAV), Photos (Immich API or local folder), HA entity cards.
- HA connection: use `home-assistant-js-websocket` (official client).
  Auth via Long-Lived Access Token initially; OAuth flow later if
  it's worth the complexity.
- **No localStorage/sessionStorage in kiosk mode** — Chromium flags
  we'll use disable storage between sessions. Any persistence goes
  through HA's own state or a file on the Pi.

### Phase 4 — Pi Deployment  ⬜  `pi-client/`
Scripts for provisioning a Pi from a fresh Raspberry Pi OS install:
- Install `unclutter`, `xdotool`, `chromium-browser` if missing
- Configure autostart (via LXDE autostart or systemd user unit) to
  launch Chromium in kiosk mode pointed at the dashboard URL
- Disable screen blanking
- Handle touchscreen calibration for common panels
- Provide a one-liner install: `curl ... | bash`

Test matrix: Pi 4 (4GB and 8GB), Pi 5 (8GB), Raspberry Pi OS Bookworm
64-bit Desktop.

### Phase 5 — Voice UI in the Dashboard  ⬜
Add voice interaction to the dashboard:
- Wake word indicator (animated dot, "listening...")
- Live transcript display
- LLM response rendering
- Quiet-listening idle state

The audio itself is captured by the HA Assist client running in the
dashboard (HA provides JS client libraries for this), then routed
through the same pipeline we built in Phase 1. Nothing new on the
Backend VM.

## Working Conventions

**Commits and branches.** Jason will sort branch strategy. For now,
direct commits to main are fine. Conventional commit prefixes
(`feat:`, `fix:`, `docs:`, `chore:`) preferred but not required.

**Secrets.** Never commit `.env`, API keys, or HA tokens. `.env.example`
is committed as a template. Add `.env` and `data/` to `.gitignore`.

**Scripts.** Bash scripts go in the same directory as the thing they
manage (e.g., `backend/manage.sh`). Make them executable. Include a
help message when invoked without args.

**Docs.** Each phase subdirectory gets its own `README.md` explaining
what that phase does, how to run it, and how to test it. Keep the
top-level README focused on project-wide scope.

**Testing.** For the backend, the `manage.sh test` command does a
Wyoming handshake check. Add similar smoke tests for new services.
For the dashboard, component-level tests with Vitest are fine — no
need for heavyweight E2E until the UI stabilizes.

## Things That Will Come Up

**"Should I run this on the HA VM instead?"** Almost always no. Keep
HA pure — it's managing Jason's real devices. The Backend VM is the
playground for AI/voice/LLM experimentation.

**"Should I add a database?"** Probably not. HA has its own state
store. If you need persistence for the dashboard (e.g., widget
config), a JSON file served from HA or stored on the Pi is
sufficient.

**"The 3090 is running out of VRAM."** Check what's loaded. Whisper
`large-v3` ~4GB, a 14B Ollama model quantized ~10GB. That's well
under 24GB. If it's actually running out, something is wrong —
probably stale models pinned in memory. `nvidia-smi` on the Backend
VM and `ollama ps` will show what's loaded.

**"I want to use a different STT/TTS/wake word engine."** Fine, but
keep the Wyoming Protocol interface. HA's Assist pipeline expects
Wyoming. Swapping the underlying engine is a few-line change in
`docker-compose.yml`. Replacing the protocol is a large refactor.

**"The user asked for X and I'm not sure if it breaks an invariant."**
Ask Jason. The invariants in this doc exist because removing them
later is much harder than respecting them now.
