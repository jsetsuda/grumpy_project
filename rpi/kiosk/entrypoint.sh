#!/bin/bash
# Grumpy Kiosk — Chromium entrypoint
# Launches Chromium in kiosk mode pointing at the dashboard.

set -e

# ── Configuration from environment ──────────────────────────────────────────
DASHBOARD_URL="${DASHBOARD_URL:-https://192.168.5.118:5173}"
DEVICE_NAME="${DEVICE_NAME:-pi-unnamed}"
ROTATION="${ROTATION:-0}"
DISPLAY="${DISPLAY:-:0}"
export DISPLAY

FULL_URL="${DASHBOARD_URL}?device=${DEVICE_NAME}"

echo "Grumpy Kiosk starting"
echo "  URL:      ${FULL_URL}"
echo "  Display:  ${DISPLAY}"
echo "  Rotation: ${ROTATION}"

# ── Graceful shutdown ───────────────────────────────────────────────────────
cleanup() {
    echo "Shutting down kiosk…"
    kill "${CHROMIUM_PID:-}" 2>/dev/null || true
    kill "${UNCLUTTER_PID:-}" 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

# ── Wait for X display ─────────────────────────────────────────────────────
echo "Waiting for X display ${DISPLAY}…"
retries=0
while ! xdotool getdisplaygeometry >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "$retries" -ge 60 ]; then
        echo "ERROR: X display ${DISPLAY} not available after 60 seconds"
        exit 1
    fi
    sleep 1
done
echo "X display ready: $(xdotool getdisplaygeometry)"

# ── Disable screen blanking ────────────────────────────────────────────────
xset s off      2>/dev/null || true
xset -dpms      2>/dev/null || true
xset s noblank  2>/dev/null || true

# ── Hide cursor ────────────────────────────────────────────────────────────
unclutter -idle 0.5 -root &
UNCLUTTER_PID=$!

# ── Launch Chromium ─────────────────────────────────────────────────────────
chromium \
    --kiosk \
    --no-sandbox \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --no-first-run \
    --disable-translate \
    --disable-features=TranslateUI \
    --autoplay-policy=no-user-gesture-required \
    --ignore-certificate-errors \
    --use-fake-ui-for-media-stream \
    --check-for-update-interval=31536000 \
    --disable-background-networking \
    --enable-features=OverlayScrollbar \
    --window-size=1920,1080 \
    "${FULL_URL}" &
CHROMIUM_PID=$!

echo "Chromium launched (PID ${CHROMIUM_PID})"

# Wait for Chromium to exit (or signal)
wait "${CHROMIUM_PID}"
