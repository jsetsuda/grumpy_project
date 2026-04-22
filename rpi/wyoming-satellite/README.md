# Wyoming Satellite

Turns a Raspberry Pi into a voice satellite for Home Assistant. Runs
alongside the Chromium kiosk (`../kiosk/`) but as a separate systemd
service — the kiosk does display, this does audio.

## What it does

- Captures mic audio continuously.
- Forwards audio to the Backend VM's openWakeWord service (`:10400`).
- When the wake word fires, streams audio to HA's Assist pipeline.
- Receives TTS audio back from HA, plays it on the Pi's speaker.
- Advertises itself to HA on port `10700` — HA creates an
  `assist_satellite.*` entity for it.

## Install

On a fresh Pi:

```
cd rpi/wyoming-satellite
./setup.sh
```

The installer:

1. Installs apt deps (`python3-venv`, `alsa-utils`).
2. Autodetects mic and speaker (prefers USB mic, HDMI out).
3. Optionally runs a 2-second record/playback sanity test.
4. Creates a venv in `~/grumpy-satellite/.venv` and installs
   `wyoming-satellite` from PyPI.
5. Writes `~/grumpy-satellite/config.env` from detected values.
6. Installs `/etc/systemd/system/wyoming-satellite.service` and
   enables/starts it.

Safe to rerun — existing config is backed up to `.bak`.

Then in HA: **Settings → Devices & Services → Add Integration →
Wyoming Protocol**, host = this Pi's IP, port `10700`.

## Wake word

Ships with `ok_nabu` as the default — the Backend VM's openWakeWord
container has this pre-loaded.

Stock words available today (no training needed): `ok_nabu`,
`hey_jarvis`, `hey_mycroft`, `alexa`.

Switching to "Hey Grumpy" requires a one-time training run on the 3090
(Phase 2.5 in `CLAUDE.md`). Once the `.tflite` is dropped into
`backend/data/openwakeword/`:

```
# on the Pi
sed -i 's/^WAKE_WORD_NAME=.*/WAKE_WORD_NAME=hey_grumpy/' ~/grumpy-satellite/config.env
sudo systemctl restart wyoming-satellite
```

## Audio device troubleshooting

If the sanity test fails or you don't hear yourself:

```
arecord -L    # list input devices
aplay -L      # list output devices
```

Edit `~/grumpy-satellite/config.env`, set `MIC_DEVICE` / `SPEAKER_DEVICE`
to the device ID from those commands (usually starts with `plughw:`),
then `sudo systemctl restart wyoming-satellite`.

Common pitfalls on Raspberry Pi OS:

- USB mic not detected → plug/unplug, run `dmesg | tail` to see if it
  enumerated.
- HDMI audio silent → verify `raspi-config` → Advanced Options →
  Audio is set correctly; some HDMI displays need force-hdmi in
  `/boot/firmware/config.txt`.
- Permission denied on `/dev/snd/*` → add user to `audio` group:
  `sudo usermod -aG audio $USER`, log out and back in.

## Lifecycle

```
sudo systemctl status   wyoming-satellite
sudo systemctl restart  wyoming-satellite
sudo journalctl -u      wyoming-satellite -f
sudo systemctl disable --now wyoming-satellite   # stop listening
```

## Relationship to the kiosk

The kiosk container (`../kiosk/`) handles the display and also has a
click-to-talk mic button inside the dashboard (separate code path —
connects directly to HA's Assist WebSocket). Both modes flow through
the same HA pipeline, so responses are consistent.

The dashboard watches HA events for this satellite's entity and
animates the voice overlay accordingly, so saying the wake word
triggers the visual UI too.

## Mic sharing with the kiosk (PipeWire)

The satellite and the Chromium kiosk both need the same USB mic.
Direct ALSA (`arecord -D plughw:...`) locks the hardware exclusively,
which silently breaks dashboard click-to-talk. To avoid that, this
unit runs `pw-record` / `pw-play` — clients of PipeWire — so both the
satellite and Chromium (via PipeWire's PulseAudio compat socket) share
the device.

Consequences:

- `pipewire-bin` must be installed (the installer adds it).
- The service needs `XDG_RUNTIME_DIR=/run/user/<uid>` so pw-record can
  find the user's PipeWire daemon; the installer substitutes the UID.
- `MIC_DEVICE` / `SPEAKER_DEVICE` in `config.env` are used only for
  the optional sanity test in `setup.sh`; the running satellite just
  uses the PipeWire default source/sink. To override, set the default
  in PipeWire (e.g. `wpctl set-default <ID>`).

## Wake-word sensitivity

`backend/docker-compose.yml` sets `--threshold ${WAKE_THRESHOLD:-0.5}`.
`0.5` is openWakeWord's default; some mics (notably conference
speakerphones with heavy DSP like the Sennheiser SP 20) need `0.3`
for reliable detection of `okay_nabu`. Edit the Backend VM's `.env`
and restart the `openwakeword` service.
