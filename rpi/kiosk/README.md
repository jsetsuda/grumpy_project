# Grumpy Kiosk — Raspberry Pi Chromium Kiosk

Runs the Grumpy dashboard full-screen in Chromium inside a Docker container on a Raspberry Pi.

## Prerequisites

- Raspberry Pi 4 or Pi 5
- Raspberry Pi OS **Bookworm 64-bit Desktop** (the Desktop image — not Lite)
- Network connectivity to the Grumpy backend server
- Display connected (HDMI or DSI touchscreen)
- USB microphone and speakers for voice interaction

## Quick Start

```bash
git clone <repo-url> grumpy
cd grumpy/rpi/kiosk
./setup.sh
```

The setup script will:
1. Install Docker (if not already present)
2. Prompt for the dashboard URL and device name
3. Build and start the kiosk container
4. Enable automatic start on boot

You can also pass arguments directly:

```bash
./setup.sh https://192.168.5.118:5173 pi-kitchen
```

## Configuration

All configuration lives in `.env` (created by `setup.sh`):

| Variable        | Default                           | Description                     |
|-----------------|-----------------------------------|---------------------------------|
| `DASHBOARD_URL` | `https://192.168.5.118:5173`      | Backend dashboard URL           |
| `DEVICE_NAME`   | `pi-unnamed`                      | Device identifier in the URL    |
| `DISPLAY`       | `:0`                              | X11 display                     |

After editing `.env`, restart the container:

```bash
./manage.sh restart
```

## Management

```bash
./manage.sh up        # Start the kiosk
./manage.sh down      # Stop the kiosk
./manage.sh logs      # Follow container logs
./manage.sh restart   # Restart the kiosk
./manage.sh status    # Show container status
./manage.sh url       # Print the dashboard URL
./manage.sh update    # Pull latest code, rebuild, restart
```

## Troubleshooting

### Black screen / Chromium does not start

- Verify X is running: `echo $DISPLAY` should return `:0`
- Check logs: `./manage.sh logs`
- Grant X11 access: `xhost +local:`
- Ensure you are using the Desktop (not Lite) image of RPi OS

### No audio output

- Check PulseAudio is running: `pactl info`
- Verify the volume mount in `docker-compose.yml` matches your user ID
- Test audio outside Docker: `speaker-test -t wav -c 2`

### No microphone / voice not detected

- List capture devices: `arecord -l`
- The container uses `--use-fake-ui-for-media-stream` to auto-grant mic permission
- Ensure `/dev/snd` is accessible inside the container

### Changing the dashboard URL

Edit `.env`, then:

```bash
./manage.sh restart
```

Or re-run setup:

```bash
./setup.sh https://new-url:5173 pi-kitchen
```
