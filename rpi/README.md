# Grumpy — Raspberry Pi Client

Everything that runs on a Raspberry Pi when it's deployed as a Grumpy
dashboard screen. Three independent services plus an optional local
dashboard server.

## Role

Each Pi hosts:

| Service | Purpose | Lives in |
|---|---|---|
| **Kiosk** | Chromium in fullscreen, points at the dashboard | `rpi/kiosk/` |
| **linux-voice-assistant** | Local wake word + voice satellite (ESPHome API) | `rpi/linux-voice-assistant/` |
| **librespot** | Spotify Connect target (plays through Pi speakers) | `rpi/librespot/` |
| **Dashboard server** (optional) | Local copy of the React dashboard + API proxy | `rpi/dashboard/` |

Per CLAUDE.md invariants, the Pi is a *thin client*: display + audio
capture/playback. Business logic lives on the Home Assistant VM or
Backend VM.

## Target hardware

- Raspberry Pi 4 (4 GB or 8 GB) or Raspberry Pi 5 (4 GB+)
- Raspberry Pi OS Trixie 64-bit **Desktop** (labwc + Xwayland;
  PipeWire audio stack). Bookworm (LXDE + Xorg) also works.
- Official 7" touchscreen (1024×600) or HDMI display
- USB microphone (or ReSpeaker HAT)
- Speakers — HDMI out, 3.5 mm jack, or USB

## Network

By default each Pi talks to two other hosts on your LAN:

- **Backend VM** (e.g. `192.168.5.118`) — runs Whisper, Piper,
  openWakeWord, Ollama. The dashboard usually lives here too and is
  served over HTTPS on port 5173.
- **Home Assistant** (e.g. `192.168.2.94:8123`) — orchestrates the
  voice pipeline and exposes the ESPHome integration that pairs with
  linux-voice-assistant.

If HA and the Pi are on different subnets (common with UniFi setups),
make sure your firewall rules allow inter-VLAN traffic on the ports
listed under each service below.

## Install order

Run these in order on a fresh Pi OS install:

1. **Kiosk** — gets the dashboard showing immediately.
2. **linux-voice-assistant** — adds voice.
3. **librespot** — adds Spotify Connect.
4. **Dashboard server** (optional) — skip unless you want this Pi to
   serve its own dashboard copy rather than reading from the Backend
   VM.

Each subdirectory has its own README with the specifics; what follows
is the deployment overview.

### 0. Prereqs

```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"
# log out + back in so docker group membership takes effect
git clone git@github.com:jsetsuda/grumpy_project.git ~/grumpy
```

Everything below runs from `~/grumpy/rpi/`.

### One-command install

For a fresh Pi, the top-level orchestrator runs steps 1-3 in order
and asks for the dashboard URL + device name only once:

```bash
cd ~/grumpy/rpi
./setup.sh
```

Useful flags:
- `--dashboard-url URL` / `--device-name NAME` — non-interactive
- `--skip-kiosk` / `--skip-lva` / `--skip-librespot` — re-run a subset

The per-service `setup.sh` files below still work and stay the
"advanced" path — useful when something fails partway and you want to
re-run a single piece, or when you're managing one service in
isolation.

### 1. Kiosk (`rpi/kiosk/`)

Chromium in kiosk mode, launched via a Docker container managed by
systemd. Auto-restarts every 12 h to clear Chromium memory leaks.

```bash
cd ~/grumpy/rpi/kiosk
./setup.sh
```

You'll be prompted for the dashboard URL (e.g.
`https://192.168.5.118:5173`) and a device name (defaults to the
hostname).

Installs:
- Docker image `grumpy-kiosk`
- systemd unit `grumpy-kiosk.service` (WantedBy=graphical.target)
- systemd unit `grumpy-kiosk-restart.service` +
  `grumpy-kiosk-restart.timer` — OnBootSec=12h, OnUnitActiveSec=12h

Management:
```bash
./manage.sh {up|down|logs|restart|status|url|update}
systemctl list-timers grumpy-kiosk-restart.timer
```

Full details: [`rpi/kiosk/README.md`](./kiosk/README.md).

### 2. linux-voice-assistant (`rpi/linux-voice-assistant/`)

Runs the OHF-Voice `linux-voice-assistant` container. Advertises
itself over mDNS as an ESPHome native-API device on port 6053.

```bash
cd ~/grumpy/rpi/linux-voice-assistant
./setup.sh
```

After install, **in Home Assistant**:

1. **Settings → Devices & Services → Add Integration → ESPHome**
2. Host: the Pi's IP, port 6053.
3. If prompted for an encryption key, read it from
   `docker logs linux-voice-assistant 2>&1 | grep -iE 'encryption|noise'`
   on the Pi and paste it.

New entities that appear:
- `assist_satellite.grumpy_<hostname>` — HA Assist satellite
- `media_player.<hostname>_media_player` — audio target for MA
- A handful of `switch.`/`select.` entities for mute/wake-word pick/etc.

Ports used:
- `6053/tcp` inbound (HA → Pi) for the ESPHome API
- Outbound to the Backend VM for STT/TTS/wake-word via the HA pipeline

Full details: [`rpi/linux-voice-assistant/README.md`](./linux-voice-assistant/README.md).

### 3. librespot (`rpi/librespot/`)

Native Spotify Connect target so the Pi shows up in Spotify's device
picker. Chromium on Pi OS lacks Widevine, so the dashboard's Web
Playback SDK can't register the browser as a device — librespot fills
that gap.

```bash
cd ~/grumpy/rpi/librespot
./setup.sh
```

Installs (via `raspotify` apt repo):
- Package `raspotify`
- systemd unit `raspotify.service`
- Config at `/etc/raspotify/conf` (device name = `Grumpy (<hostname>)`)

Auto-detects PipeWire vs. raw ALSA and picks the right backend.
Coexists with linux-voice-assistant — both share the audio output via
PipeWire's PulseAudio shim.

Management:
```bash
sudo systemctl status   raspotify
sudo systemctl restart  raspotify
sudo journalctl -u      raspotify -f
sudo nano /etc/raspotify/conf
```

Full details: [`rpi/librespot/README.md`](./librespot/README.md).

### 4. Dashboard server (`rpi/dashboard/`, optional)

Most deployments leave this off — the Pi's Chromium just loads the
dashboard served by the Backend VM. Run your own local dashboard
server only if you want:
- Per-Pi isolation from Backend VM downtime
- Different `credentials.json` per Pi

```bash
cd ~/grumpy/rpi/dashboard
npm install
npm run build
# Production server:
npm start          # serves HTTPS on :5173 with a self-signed cert
# OR dev server:
npm run dev        # hot-reload, same port
```

If you run a local server, remember:
- **`credentials.json`** is gitignored. Copy it from the Backend VM or
  enter credentials via the Manager UI per-Pi.
- **Kiosk URL** should point at `localhost:5173` instead of the
  Backend VM — re-run `rpi/kiosk/setup.sh` with the new URL.

Runtime state written to the Pi:
- `rpi/dashboard/credentials.json` — shared creds (gitignored)
- `rpi/dashboard/devices.json` — device → dashboard map (gitignored)
- `rpi/dashboard/instances/<deviceId>.json` — per-device overrides
  (gitignored)
- `rpi/dashboard/.certs/` — self-signed TLS cert (gitignored)

Full details: [`rpi/dashboard/README.md`](./dashboard/README.md).

## Post-install checklist

Walk through these after the first install to confirm everything's
wired:

- [ ] **Kiosk shows dashboard** — Chromium full-screen, no cursor
- [ ] **Voice works** — click the mic on the dashboard, say "what
      time is it" → TTS response plays
- [ ] **Wake word fires** — say "Hey Nabu" near the Pi → dashboard
      voice overlay animates
- [ ] **Spotify sees the Pi** — open Spotify on another device, device
      picker lists `Grumpy (<hostname>)` — select and play; audio
      comes out the Pi
- [ ] **Music Assistant sees the Pi** — at `http://<HA-IP>:8095/`,
      Settings → Players shows the Pi and it plays when targeted
- [ ] **Dashboard auto-registers** — load the dashboard with
      `?device=<hostname>`; Manager's Device Assignments table shows
      the new device
- [ ] **Motion popup triggers** (if configured) — wave at the front
      door → dashboard takes over with the camera view

## Network diagram

```
 ┌───────────────────────────────────────────────────────────────┐
 │                         Your LAN                              │
 │                                                                │
 │   ┌────────────┐        ┌─────────────┐      ┌──────────────┐ │
 │   │ Raspberry  │        │     Home    │      │   Backend    │ │
 │   │   Pi       │◄──────►│  Assistant  │◄────►│     VM       │ │
 │   │            │  6053  │   :8123     │      │ (this repo)  │ │
 │   │            │        │   :8095 MA  │      │  Whisper     │ │
 │   │ kiosk      │        │             │      │  Piper       │ │
 │   │ LVA        │        │             │      │  openWake    │ │
 │   │ librespot  │        │             │      │  Ollama      │ │
 │   └────────────┘        └─────────────┘      │  Dashboard   │ │
 │                                               │   :5173      │ │
 │                                               └──────────────┘ │
 └───────────────────────────────────────────────────────────────┘
        kiosk loads  ←─  dashboard  ←  HTTPS  ←  Backend VM
        LVA  ↔ ESPHome API  ↔  HA pipeline  ↔  Backend VM
        librespot  ↔ Spotify Cloud  (outbound only)
```

## Troubleshooting matrix

| Symptom | Most likely cause | Fix |
|---|---|---|
| Kiosk boots to black screen | X display not ready / Chromium blocked | `./manage.sh logs`; for root-user Chromium see kiosk README |
| Voice overlay flashes and dies | HA creds missing / wrong | Check shared credentials in Dashboard Manager |
| HA can't add ESPHome device | Missing encryption key | Read LVA logs for `noise_psk`, paste into HA form |
| HA can add device but no voice response | Pipeline agent not set (no TTS) | In HA voice-assistant pipeline, select Piper as TTS |
| Pi not in Spotify device picker | librespot not running | `sudo systemctl status raspotify` on the Pi |
| Widget missing credentials on Pi | Local `credentials.json` empty | SCP from Backend VM or edit via Manager UI |
| HA → Pi connection refused | Inter-VLAN firewall | Add exclusion rule for the Pi's IP (6053, 5173) |

## Scheduled maintenance

The kiosk systemd timer restarts Chromium every 12 hours by default.
LVA, librespot, and the dashboard server run indefinitely — restart
them manually if they misbehave:

```bash
sudo systemctl restart raspotify                      # Spotify
cd ~/grumpy/rpi/linux-voice-assistant && docker compose restart
cd ~/grumpy/rpi/kiosk && ./manage.sh restart          # Kiosk now
sudo systemctl start grumpy-kiosk-restart.service     # Kiosk via the scheduled path
```

## Related phase work

- **Phase 1** voice stack (Whisper/Piper/openWakeWord) — runs on the
  Backend VM. See `backend/README.md`.
- **Phase 2** LLM agent (Ollama) — runs on the Backend VM. See
  `backend/README.md`.
- **Phase 3** dashboard — source in `rpi/dashboard/`, normally served
  by the Backend VM but optionally runnable on the Pi itself.
- **Phase 4** Pi deployment — this document.
