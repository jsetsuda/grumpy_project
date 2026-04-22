# librespot — Spotify Connect on the Pi

Makes the Pi appear as a Spotify Connect device named `Grumpy (<host>)`.
Installed as a systemd service via [raspotify](https://github.com/dtcooper/raspotify),
which is the apt-packaged distribution of [librespot](https://github.com/librespot-org/librespot).

## Why this and not the dashboard's Web Playback SDK

The dashboard's Web Playback SDK requires Widevine DRM in the browser.
Stock Chromium on Raspberry Pi OS doesn't ship Widevine, so the SDK
silently fails to register the Pi. librespot doesn't use a browser at
all — it speaks Spotify's Connect protocol directly and outputs to
ALSA/PipeWire.

Spotify Premium is required (Connect feature, not librespot's
limitation).

## Install

On a fresh Pi:

```
cd rpi/librespot
./setup.sh
```

The installer:

1. Adds the raspotify apt repo and installs the `raspotify` package.
2. Writes `/etc/raspotify/conf` with a device name derived from the
   hostname (`Grumpy (<host>)`), high-bitrate audio, and the PipeWire/
   PulseAudio output backend so it shares the audio device with
   linux-voice-assistant cleanly.
3. Enables and starts the systemd service.

Safe to rerun. Existing config is backed up to `.bak`.

After install, open Spotify on your phone or computer → device picker
→ pick **Grumpy (`<host>`)**. Music plays through the Pi's speaker.

## Lifecycle

```
sudo systemctl status   raspotify
sudo systemctl restart  raspotify
sudo journalctl -u      raspotify -f
```

Config lives at `/etc/raspotify/conf`. Edit and restart to apply.

## Common config tweaks

In `/etc/raspotify/conf`:

```
LIBRESPOT_NAME=Grumpy (kitchen)        # what shows in Spotify's device list
LIBRESPOT_BITRATE=320                  # 96, 160, 320 kbps
LIBRESPOT_BACKEND=pulseaudio           # alsa | pulseaudio | pipe
LIBRESPOT_DEVICE=                      # blank = default; or specific PA sink name
LIBRESPOT_INITIAL_VOLUME=80            # 0-100
```

## Troubleshooting

- **No device shows in Spotify** → `journalctl -u raspotify -e`. Common
  causes: no internet from the Pi, account not Premium.
- **Device appears but no audio** → wrong audio backend. If the Pi
  uses PipeWire (default with linux-voice-assistant), keep
  `LIBRESPOT_BACKEND=pulseaudio` (PipeWire ships a PulseAudio shim).
  If the Pi uses raw ALSA, switch to `LIBRESPOT_BACKEND=alsa` and
  set `LIBRESPOT_DEVICE` to your output device (`aplay -L` lists them).
- **Audio cuts out after a few seconds** → PulseAudio resume issue.
  Add `LIBRESPOT_DITHER=none` to the conf and restart.

## Coexistence with linux-voice-assistant

Both services share the same audio output. PipeWire's PA-shim
multiplexes them automatically — librespot music can play while
the satellite stays ready for wake words. When the satellite plays
TTS, both streams mix. If TTS sounds garbled while music plays, set
`LIBRESPOT_VOLUME_NORMALISATION=true` and restart raspotify.
