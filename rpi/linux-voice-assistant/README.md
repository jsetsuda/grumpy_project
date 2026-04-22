# Linux-Voice-Assistant

Local voice assistant for the Grumpy Pi kiosk. Replaces
`../wyoming-satellite/`.

Upstream project: <https://github.com/OHF-Voice/linux-voice-assistant>

## Why this, not wyoming-satellite

- **Wake word runs on the Pi.** No round trip to the Backend VM for
  detection; less sensitive to network + threshold tuning.
- **ESPHome protocol** (port 6053), not Wyoming. HA treats the device
  as a native voice satellite — same integration layer as ESP32-based
  voice pucks.
- **PipeWire-native.** Mic and speaker go through the host's PipeWire,
  so the Chromium kiosk's click-to-talk keeps working at the same time.
- Ships `okay_nabu`, `hey_jarvis`, `alexa`, `hey_mycroft`,
  `hey_luna`, `hey_home_assistant`, `okay_computer`, `choo_choo_homie`
  out of the box. Model files live in the container.

## Prereqs

- Docker + Docker Compose plugin (the kiosk setup installs these).
- Desktop Raspberry Pi OS (needs PipeWire running in the user session —
  the Chromium kiosk setup already relies on this).
- Mic audible as a PipeWire source (any USB mic works).

## Install

```
cd rpi/linux-voice-assistant
./setup.sh
```

That's it. The script writes `.env`, pulls the image, and starts the
container.

Then in Home Assistant: **Settings → Devices & Services → Add
Integration → ESPHome**, host = this Pi's IP, port `6053`. Zeroconf
usually discovers it automatically. Assign an Assist pipeline on the
device page.

## Upgrade

```
docker compose pull && docker compose up -d
```

## Configuration

`.env` is generated from `.env.example` with `CLIENT_NAME` filled in.
The upstream project documents every environment variable; common
ones to tune:

| Var                      | Default     | Notes                                |
|--------------------------|-------------|--------------------------------------|
| `CLIENT_NAME`            | *(unset)*   | Friendly name shown in HA            |
| `WAKE_MODEL`             | `okay_nabu` | Any shipped model, or custom         |
| `MIC_AUTO_GAIN`          | *(off)*     | dBFS target for AGC                  |
| `MIC_NOISE_SUPPRESSION`  | *(off)*     | `0`–`4`, higher = more aggressive    |
| `AUDIO_INPUT_DEVICE`     | `default`   | PipeWire / Pulse source name         |
| `AUDIO_OUTPUT_DEVICE`    | `default`   | PipeWire / Pulse sink name           |
| `ENABLE_DEBUG`           | *(off)*     | Verbose logging                      |

After editing `.env`:

```
docker compose restart
```

## Troubleshooting

- **No wake fire.** `docker compose logs -f linux-voice-assistant`.
  The microWakeWord `okay_nabu` model has `probability_cutoff=0.85`.
  Conference speakerphones with heavy DSP (e.g. Sennheiser SP 20) can
  still struggle; a plain headset or clip-on mic is the cleanest fix.
- **"PulseAudio not running".** The container needs the host's
  PipeWire-Pulse socket at `/run/user/1000/pulse/native`. That socket
  is created by a graphical login session — if the Pi is headless and
  no one has logged in, `systemctl --user enable pipewire pipewire-pulse
  wireplumber` for the audio user.
- **Mic held by another process.** Make sure `wyoming-satellite` is
  disabled (`sudo systemctl disable --now wyoming-satellite`); it used
  `arecord` directly and locks the hardware.
- **Not showing up in HA.** ESPHome discovery relies on mDNS; check
  that Avahi is running on the same LAN as HA, or add it manually by
  IP:6053.

## Relationship to the kiosk

The kiosk (`../kiosk/`) handles the display and has its own
click-to-talk mic button that talks directly to HA's Assist WebSocket.
Both paths use the same PipeWire mic and the same HA pipeline — two
ways in, one brain.
