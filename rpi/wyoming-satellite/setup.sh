#!/bin/bash
# Grumpy Wyoming Satellite setup
# Usage: ./setup.sh [DEVICE_NAME]
#
# One-command install for a Raspberry Pi. Safe to rerun (idempotent).
#
#  Steps:
#   1. Install apt dependencies (python3-venv, alsa-utils, curl).
#   2. Autodetect mic + speaker, confirm with user.
#   3. Create venv, pip install wyoming-satellite.
#   4. Render config.env from template + detected values.
#   5. Render systemd unit with absolute paths, install to /etc/systemd/system/.
#   6. Enable + start the service.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$HOME/grumpy-satellite}"
SERVICE_NAME="wyoming-satellite"
SYSTEMD_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 1. Sanity checks ───────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] && error "Don't run as root — script calls sudo where needed."

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "armv7l" && "$ARCH" != "x86_64" ]]; then
    warn "Unexpected architecture: ${ARCH}. Continuing anyway."
fi
info "Architecture: ${ARCH}"

# ── 2. Install apt dependencies ───────────────────────────────────────────
info "Installing system packages (may prompt for sudo)…"
sudo apt-get update -qq
sudo apt-get install -y -qq python3-venv python3-pip alsa-utils curl

# ── 3. Collect device name ─────────────────────────────────────────────────
DEVICE_NAME="${1:-}"
if [[ -z "$DEVICE_NAME" ]]; then
    DEFAULT_NAME="pi-$(hostname -s)"
    read -rp "Device name [${DEFAULT_NAME}]: " DEVICE_NAME
    DEVICE_NAME="${DEVICE_NAME:-$DEFAULT_NAME}"
fi
info "Device name: ${DEVICE_NAME}"

# ── 4. Audio autodetect ────────────────────────────────────────────────────
info "Detecting audio devices…"

# USB headsets rarely have "USB" in their ALSA card name (e.g. Sennheiser SP 20
# appears as CARD=Lync), so match on the snd-usb-audio driver in
# /proc/asound/cards instead of the card name string.
detect_usb_card() {
    awk -F '[][]' '$3 ~ /USB[- ]Audio/{gsub(/ /,"",$2); print $2; exit}' \
        /proc/asound/cards 2>/dev/null
}

detect_mic() {
    local usb_card usb_dev default_dev first_plughw
    usb_card="$(detect_usb_card)"
    if [[ -n "$usb_card" ]]; then
        usb_dev="$(arecord -L 2>/dev/null | grep -E "^plughw:CARD=${usb_card}," | head -1 || true)"
        if [[ -n "$usb_dev" ]]; then echo "$usb_dev"; return; fi
    fi
    default_dev="$(arecord -L 2>/dev/null | grep -E '^default$' | head -1 || true)"
    if [[ -n "$default_dev" ]]; then echo "$default_dev"; return; fi
    first_plughw="$(arecord -L 2>/dev/null | grep -E '^plughw:' | head -1 || true)"
    [[ -n "$first_plughw" ]] && echo "$first_plughw" || echo "default"
}

# Prefer USB (common when a USB speakerphone provides both mic and speaker),
# then HDMI, then the 3.5mm jack, then whatever ALSA exposes.
detect_speaker() {
    local usb_card usb_dev hdmi_dev jack_dev default_dev first_plughw
    usb_card="$(detect_usb_card)"
    if [[ -n "$usb_card" ]]; then
        usb_dev="$(aplay -L 2>/dev/null | grep -E "^plughw:CARD=${usb_card}," | head -1 || true)"
        if [[ -n "$usb_dev" ]]; then echo "$usb_dev"; return; fi
    fi
    hdmi_dev="$(aplay -L 2>/dev/null | grep -iE '^plughw:CARD=.*(HDMI|vc4hdmi)' | head -1 || true)"
    jack_dev="$(aplay -L 2>/dev/null | grep -iE '^plughw:CARD=.*Headphones' | head -1 || true)"
    default_dev="$(aplay -L 2>/dev/null | grep -E '^default$' | head -1 || true)"
    first_plughw="$(aplay -L 2>/dev/null | grep -E '^plughw:' | head -1 || true)"
    [[ -n "$hdmi_dev" ]] && { echo "$hdmi_dev"; return; }
    [[ -n "$default_dev" ]] && { echo "$default_dev"; return; }
    [[ -n "$jack_dev" ]] && { echo "$jack_dev"; return; }
    [[ -n "$first_plughw" ]] && echo "$first_plughw" || echo "default"
}

MIC_DEVICE="$(detect_mic)"
SPEAKER_DEVICE="$(detect_speaker)"

echo
info "Detected mic:     ${MIC_DEVICE}"
info "Detected speaker: ${SPEAKER_DEVICE}"
echo "  (see full lists with: arecord -L  and  aplay -L)"
echo

read -rp "Accept detected devices? [Y/n] " accept
if [[ "$accept" =~ ^[Nn]$ ]]; then
    read -rp "Mic device [${MIC_DEVICE}]: " answer
    MIC_DEVICE="${answer:-$MIC_DEVICE}"
    read -rp "Speaker device [${SPEAKER_DEVICE}]: " answer
    SPEAKER_DEVICE="${answer:-$SPEAKER_DEVICE}"
fi

# Quick sanity test — record and play 2 seconds.
if command -v arecord &>/dev/null && command -v aplay &>/dev/null; then
    read -rp "Run a 2-second record/playback test? [y/N] " run_test
    if [[ "$run_test" =~ ^[Yy]$ ]]; then
        TMP_WAV="$(mktemp --suffix=.wav)"
        trap "rm -f '$TMP_WAV'" EXIT
        info "Speak for 2 seconds after the beep…"
        sleep 1
        printf '\a'
        arecord -D "$MIC_DEVICE" -r 16000 -c 1 -f S16_LE -d 2 "$TMP_WAV" 2>/dev/null \
            || warn "arecord failed — mic device may be wrong."
        info "Playing back…"
        aplay -D "$SPEAKER_DEVICE" "$TMP_WAV" 2>/dev/null \
            || warn "aplay failed — speaker device may be wrong."
    fi
fi

# ── 5. Python install of wyoming-satellite ────────────────────────────────
info "Installing wyoming-satellite into ${INSTALL_DIR}…"
mkdir -p "$INSTALL_DIR"
if [[ ! -d "$INSTALL_DIR/.venv" ]]; then
    python3 -m venv "$INSTALL_DIR/.venv"
fi
"$INSTALL_DIR/.venv/bin/pip" install --upgrade pip wheel >/dev/null
# wyoming-satellite on PyPI is stuck at 1.0.0; newer code (with VAD support
# this unit uses) lives on the upstream git main branch. pysilero-vad is the
# runtime dep for the `--vad` flag.
"$INSTALL_DIR/.venv/bin/pip" install --upgrade \
    'git+https://github.com/rhasspy/wyoming-satellite.git' \
    pysilero-vad

# ── 6. Write config.env ───────────────────────────────────────────────────
CONFIG_PATH="$INSTALL_DIR/config.env"
if [[ -f "$CONFIG_PATH" ]]; then
    warn "$CONFIG_PATH exists — backing up to ${CONFIG_PATH}.bak"
    cp "$CONFIG_PATH" "${CONFIG_PATH}.bak"
fi
cat > "$CONFIG_PATH" <<EOF
# Grumpy Wyoming Satellite config (generated by setup.sh on $(date -Iseconds))
DEVICE_NAME=${DEVICE_NAME}
MIC_DEVICE=${MIC_DEVICE}
SPEAKER_DEVICE=${SPEAKER_DEVICE}
MIC_RATE=16000
SPEAKER_RATE=22050
WAKE_HOST=192.168.5.118
WAKE_PORT=10400
WAKE_WORD_NAME=ok_nabu
SATELLITE_PORT=10700
EOF
chmod 600 "$CONFIG_PATH"
info "Wrote ${CONFIG_PATH}"

# ── 7. Install systemd unit ────────────────────────────────────────────────
info "Installing systemd unit at ${SYSTEMD_PATH}…"
TMP_UNIT="$(mktemp)"
sed -e "s|__USER__|$USER|g" \
    -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    "$SCRIPT_DIR/wyoming-satellite.service" > "$TMP_UNIT"
sudo mv "$TMP_UNIT" "$SYSTEMD_PATH"
sudo chmod 644 "$SYSTEMD_PATH"

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "wyoming-satellite is running."
else
    warn "wyoming-satellite failed to start. Check: sudo journalctl -u $SERVICE_NAME -e"
fi

# ── 8. Wrap-up ─────────────────────────────────────────────────────────────
echo
info "Satellite installed. Next steps:"
cat <<EOF

  1. In Home Assistant:
     Settings → Devices & Services → Add Integration → "Wyoming Protocol"
     Host: $(hostname -I | awk '{print $1}')
     Port: 10700

     A new entity 'assist_satellite.grumpy_${DEVICE_NAME//-/_}' will appear.

  2. Try saying "Hey Nabu, what time is it?" near the mic.

  3. Useful commands:
     sudo systemctl status  $SERVICE_NAME
     sudo journalctl -u     $SERVICE_NAME -f
     sudo systemctl restart $SERVICE_NAME

  4. Custom wake word "hey_grumpy":
     Once a hey_grumpy.tflite is trained and deployed to the Backend VM
     at backend/data/openwakeword/, edit ${CONFIG_PATH}:
         WAKE_WORD_NAME=hey_grumpy
     Then: sudo systemctl restart $SERVICE_NAME

EOF
