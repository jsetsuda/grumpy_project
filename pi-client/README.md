# Grumpy Pi Client (Phase 4)

Provisioning scripts and config for the Raspberry Pi kiosk.

**Not yet implemented.** Phase 4 comes after the dashboard exists.
See [`../CLAUDE.md`](../CLAUDE.md) for the Phase 4 plan.

## Target Hardware

- Raspberry Pi 4 (4GB or 8GB) OR Raspberry Pi 5 (8GB)
- Raspberry Pi OS Bookworm 64-bit Desktop
- Official 7" touchscreen or compatible DSI/HDMI panel
- USB microphone (or ReSpeaker HAT)
- Speakers (USB, 3.5mm, or touchscreen-integrated)

## Planned Contents

- One-liner install script: `curl ... | bash`
- Chromium kiosk autostart (LXDE autostart or systemd user unit)
- Screen blanking disabled
- Cursor hidden (`unclutter`)
- Touchscreen calibration helper
- Audio device configuration for the mic + speakers
