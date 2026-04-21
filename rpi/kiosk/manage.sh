#!/bin/bash
# Grumpy kiosk — management helper.
# Usage: ./manage.sh {up|down|logs|restart|status|url|update}

set -e
cd "$(dirname "$0")"

# Load .env for the url command
load_env() {
    if [[ -f .env ]]; then
        # shellcheck disable=SC1091
        source .env
    fi
}

case "${1:-}" in
  up)
    docker compose up -d
    echo "Grumpy kiosk started. Watch logs with: $0 logs"
    ;;
  down)
    docker compose down
    ;;
  logs)
    docker compose logs -f "${2:-}"
    ;;
  restart)
    docker compose restart
    echo "Grumpy kiosk restarted."
    ;;
  status)
    docker compose ps
    ;;
  url)
    load_env
    DASHBOARD_URL="${DASHBOARD_URL:-https://192.168.5.118:5173}"
    DEVICE_NAME="${DEVICE_NAME:-pi-unnamed}"
    echo "${DASHBOARD_URL}?device=${DEVICE_NAME}"
    ;;
  update)
    echo "Pulling latest code…"
    git pull
    echo "Rebuilding container…"
    docker compose build
    docker compose up -d
    echo "Grumpy kiosk updated and restarted."
    ;;
  *)
    echo "Grumpy kiosk manager"
    echo "Usage: $0 {up|down|logs|restart|status|url|update}"
    exit 1
    ;;
esac
