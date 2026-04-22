#!/bin/bash
# Grumpy Linux-Voice-Assistant setup
# Usage: ./setup.sh [CLIENT_NAME]
#
# One-command install for a Raspberry Pi already running the Chromium kiosk.
# Idempotent.
#
#  Steps:
#   1. Verify Docker is installed (if not, bail — the kiosk setup installs it).
#   2. Collect a friendly client name (default: pi-$(hostname -s)).
#   3. Write .env from .env.example with our overrides.
#   4. docker compose pull + up -d.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 1. Docker sanity ───────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    error "Docker not installed. Run ../kiosk/setup.sh first (it installs Docker)."
fi
if ! docker compose version &>/dev/null; then
    error "docker compose plugin not found. Install docker-compose-plugin."
fi

# ── 2. Client name ─────────────────────────────────────────────────────────
CLIENT_NAME="${1:-}"
if [[ -z "$CLIENT_NAME" ]]; then
    DEFAULT_NAME="pi-$(hostname -s)"
    read -rp "Client name [${DEFAULT_NAME}]: " CLIENT_NAME
    CLIENT_NAME="${CLIENT_NAME:-$DEFAULT_NAME}"
fi
info "Client name: ${CLIENT_NAME}"

# ── 3. Write .env ──────────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
    warn "$ENV_FILE exists — backing up to ${ENV_FILE}.bak"
    cp "$ENV_FILE" "${ENV_FILE}.bak"
fi

cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
# CLIENT_NAME is commented out in the upstream example; uncomment and set it.
sed -i "s|^# CLIENT_NAME=.*|CLIENT_NAME=\"${CLIENT_NAME}\"|" "$ENV_FILE"
info "Wrote $ENV_FILE"

# ── 4. Pull + start ────────────────────────────────────────────────────────
info "Pulling image (may take a minute on first run)…"
docker compose pull 2>&1 | tail -3
info "Starting container…"
docker compose up -d
sleep 3
docker compose ps

# ── 5. Wrap-up ─────────────────────────────────────────────────────────────
IP="$(hostname -I | awk '{print $1}')"
echo
info "linux-voice-assistant is running."
cat <<EOF

  1. In Home Assistant:
     Settings → Devices & Services → Add Integration → "ESPHome"
     Host: ${IP}
     Port: 6053
     (If ESPHome zeroconf discovery is on, it should appear automatically.)

  2. On the device page in HA, assign an Assist pipeline to the
     Voice assistant section, then say "Okay Nabu, ...".

  3. Useful commands:
     docker compose logs -f
     docker compose restart
     docker compose pull && docker compose up -d   # upgrade

  4. Environment knobs live in .env (see .env.example for all options).
     Common overrides: MIC_AUTO_GAIN, MIC_NOISE_SUPPRESSION, WAKE_MODEL.

EOF
