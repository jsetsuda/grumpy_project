# Grumpy Kiosk — Raspberry Pi Chromium Kiosk

Runs the Grumpy dashboard full-screen in Chromium inside a Docker container on a Raspberry Pi.

## Prerequisites

- Raspberry Pi 4 or Pi 5
- Raspberry Pi OS **Trixie or Bookworm 64-bit Desktop** (Trixie is the primary target; both work via the Desktop image — not Lite)
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
./setup.sh https://192.168.5.118:5173 pi-kitchen 1024,600
```

## Configuration

All configuration lives in `.env` (created by `setup.sh`):

| Variable        | Default                           | Description                     |
|-----------------|-----------------------------------|---------------------------------|
| `DASHBOARD_URL` | `https://192.168.5.118:5173`      | Backend dashboard URL           |
| `DEVICE_NAME`   | `pi-unnamed`                      | Device identifier in the URL    |
| `DISPLAY`       | `:0`                              | X11 display                     |
| `WINDOW_SIZE`   | `1920,1080`                       | Chromium window size (`w,h`)    |

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

## Scheduled restart

The installer also enables a systemd timer (`grumpy-kiosk-restart.timer`)
that restarts the kiosk every 12 hours. Long-running Chromium in kiosk
mode leaks memory over days, and a scheduled cycle keeps the dashboard
fresh without manual touch.

```bash
systemctl list-timers grumpy-kiosk-restart.timer   # next / last firing
sudo systemctl disable --now grumpy-kiosk-restart.timer  # turn it off
sudo systemctl enable --now grumpy-kiosk-restart.timer   # turn it on
```

To change the interval, edit `/etc/systemd/system/grumpy-kiosk-restart.timer`
(`OnUnitActiveSec=`) and run `sudo systemctl daemon-reload && sudo
systemctl restart grumpy-kiosk-restart.timer`.

## Troubleshooting

### Black screen / Chromium does not start

- Verify X is running: `echo $DISPLAY` should return `:0`
- Check logs: `./manage.sh logs`
- Grant X11 access: `xhost +local:` — must be run **inside the graphical
  session** (from a terminal on the desktop itself). Running it over SSH
  silently no-ops because the SSH shell has no `DISPLAY`.
- Ensure you are using the Desktop (not Lite) image of RPi OS
- Chromium is launched with `--no-sandbox` because the container runs as
  root; newer Chromium builds (e.g. on Trixie / Debian 13) refuse to
  start without this.

### Wayland / labwc (RPi OS Trixie)

Trixie uses labwc + Xwayland by default. The X11 socket at
`/tmp/.X11-unix/X0` is provided by Xwayland, which is enough for the
kiosk container — just make sure `xhost +local:` runs at login in the
graphical session (a labwc autostart entry works).

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
