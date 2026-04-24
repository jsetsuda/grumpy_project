#!/bin/bash
# Grumpy rpi shared shell helpers.
# Source from setup scripts:  source "$(dirname "$0")/../lib/common.sh"

# ── Colours + loggers ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# require_docker [--install]
#   Errors out if docker / docker compose plugin is missing. With
#   --install, runs the official get.docker.com installer if docker
#   itself is missing (compose plugin still must be present afterward).
require_docker() {
  local install=0
  [[ "${1:-}" == "--install" ]] && install=1

  if ! command -v docker &>/dev/null; then
    if [[ $install -eq 1 ]]; then
      info "Installing Docker…"
      curl -fsSL https://get.docker.com | sh
      sudo usermod -aG docker "$USER"
      info "Docker installed. You may need to log out and back in for group membership."
    else
      error "Docker not installed. Run rpi/setup.sh (or rpi/kiosk/setup.sh) first."
    fi
  fi

  if ! docker compose version &>/dev/null; then
    error "docker compose plugin not found. Install docker-compose-plugin."
  fi
}

# default_device_name — echoes "pi-<short-hostname>"
default_device_name() {
  echo "pi-$(hostname -s)"
}
