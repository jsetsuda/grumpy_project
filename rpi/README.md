# Grumpy — Raspberry Pi Client

Everything that runs on the Raspberry Pi: kiosk provisioning and the dashboard web app.

## This Machine's Role

The Pi is a **thin client**. It:
- Displays the React dashboard in Chromium kiosk mode
- Captures audio via USB microphone
- Plays TTS responses via speakers
- Holds no state — fully replaceable

## Target Hardware

- Raspberry Pi 4 (4GB or 8GB) OR Raspberry Pi 5 (8GB)
- Raspberry Pi OS Bookworm 64-bit Desktop
- Official 7" touchscreen or compatible DSI/HDMI panel
- USB microphone (or ReSpeaker HAT)
- Speakers (USB, 3.5mm, or touchscreen-integrated)

## Contents (planned)

```
rpi/
├── dashboard/       React + Vite + Tailwind dashboard app
├── provisioning/    Kiosk setup scripts, autostart config
└── README.md        This file
```

## Dashboard (Phase 3)

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- `home-assistant-js-websocket` for HA integration
- Widget-grid layout, config-driven

## Provisioning (Phase 4)

- One-liner install: `curl ... | bash`
- Chromium kiosk autostart
- Screen blanking disabled, cursor hidden
- Touchscreen calibration
- Audio device configuration
