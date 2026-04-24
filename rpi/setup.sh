#!/bin/bash
# Grumpy Pi all-in-one setup.
#
# Runs the three Pi services in the recommended install order:
#   1. kiosk (rpi/kiosk/setup.sh)
#   2. linux-voice-assistant (rpi/linux-voice-assistant/setup.sh)
#   3. librespot (rpi/librespot/setup.sh)
#
# Asks once for dashboard URL + device name, then forwards them to
# each substep so you don't get prompted three times.
#
# Usage:
#   ./setup.sh [--dashboard-url URL] [--device-name NAME]
#              [--skip-kiosk] [--skip-lva] [--skip-librespot]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

DASHBOARD_URL=""
DEVICE_NAME=""
SKIP_KIOSK=0
SKIP_LVA=0
SKIP_LIBRESPOT=0

usage() {
    cat <<USAGE
Usage: $0 [options]

  --dashboard-url URL    Dashboard URL (e.g. https://192.168.5.118:5173)
  --device-name NAME     Device name (default: pi-<short hostname>)
  --skip-kiosk           Skip the kiosk install
  --skip-lva             Skip the linux-voice-assistant install
  --skip-librespot       Skip the librespot install
  -h, --help             Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dashboard-url) DASHBOARD_URL="$2"; shift 2 ;;
        --device-name)   DEVICE_NAME="$2"; shift 2 ;;
        --skip-kiosk)    SKIP_KIOSK=1; shift ;;
        --skip-lva|--skip-voice) SKIP_LVA=1; shift ;;
        --skip-librespot|--skip-spotify) SKIP_LIBRESPOT=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) error "Unknown argument: $1 (try --help)" ;;
    esac
done

# ── Collect shared config up front ────────────────────────────────────────
if [[ $SKIP_KIOSK -eq 0 && -z "$DASHBOARD_URL" ]]; then
    read -rp "Dashboard URL [https://192.168.5.118:5173]: " DASHBOARD_URL
    DASHBOARD_URL="${DASHBOARD_URL:-https://192.168.5.118:5173}"
fi

if [[ -z "$DEVICE_NAME" ]]; then
    DEFAULT_NAME="$(default_device_name)"
    read -rp "Device name [${DEFAULT_NAME}]: " DEVICE_NAME
    DEVICE_NAME="${DEVICE_NAME:-$DEFAULT_NAME}"
fi

# ── Plan summary + confirm ────────────────────────────────────────────────
echo
info "Plan:"
[[ $SKIP_KIOSK     -eq 0 ]] && info "  • kiosk                  ($DASHBOARD_URL, $DEVICE_NAME)"
[[ $SKIP_LVA       -eq 0 ]] && info "  • linux-voice-assistant  ($DEVICE_NAME)"
[[ $SKIP_LIBRESPOT -eq 0 ]] && info "  • librespot              (Grumpy ($(hostname -s)))"
echo
read -rp "Continue? [Y/n] " ans
[[ "$ans" =~ ^[Nn]$ ]] && { info "Aborted."; exit 0; }

# ── Run substeps ──────────────────────────────────────────────────────────
if [[ $SKIP_KIOSK -eq 0 ]]; then
    echo
    info "════════ kiosk ════════"
    bash "$SCRIPT_DIR/kiosk/setup.sh" "$DASHBOARD_URL" "$DEVICE_NAME"
fi

if [[ $SKIP_LVA -eq 0 ]]; then
    echo
    info "════════ linux-voice-assistant ════════"
    bash "$SCRIPT_DIR/linux-voice-assistant/setup.sh" "$DEVICE_NAME"
fi

if [[ $SKIP_LIBRESPOT -eq 0 ]]; then
    echo
    info "════════ librespot ════════"
    bash "$SCRIPT_DIR/librespot/setup.sh" "$(hostname -s)"
fi

echo
info "All done."
[[ $SKIP_KIOSK -eq 0 ]] && info "  Dashboard: ${DASHBOARD_URL}?device=${DEVICE_NAME}"
info "  Next: walk through the post-install checklist in rpi/README.md."
