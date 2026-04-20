#!/bin/bash
# Grumpy backend — management helper.
# Usage: ./manage.sh {up|down|logs|pull|restart|status|gpu|test}

set -e
cd "$(dirname "$0")"

case "${1:-}" in
  up)
    docker compose up -d
    echo "Grumpy backend started. Watch logs with: $0 logs"
    ;;
  down)
    docker compose down
    ;;
  logs)
    docker compose logs -f "${2:-}"
    ;;
  pull)
    docker compose pull
    docker compose up -d
    ;;
  restart)
    docker compose restart "${2:-}"
    ;;
  status)
    docker compose ps
    echo ""
    echo "Port reachability from this host:"
    for port in 10200 10300 10400; do
      if nc -z -w 2 localhost $port 2>/dev/null; then
        echo "  $port  OK"
      else
        echo "  $port  UNREACHABLE"
      fi
    done
    ;;
  gpu)
    # Verify the host sees the GPU and the container can reach it
    echo "=== Host nvidia-smi ==="
    nvidia-smi || echo "nvidia-smi not available on host"
    echo ""
    echo "=== Whisper container GPU visibility ==="
    docker exec grumpy-whisper nvidia-smi 2>/dev/null \
      || echo "Whisper container not running or GPU not passed through"
    ;;
  test)
    # Wyoming handshake test. Requires: pip install wyoming
    if ! python3 -c "import wyoming" 2>/dev/null; then
      echo "Install test dependency: pip install wyoming"
      exit 1
    fi
    python3 <<'PY'
import asyncio
from wyoming.client import AsyncTcpClient
from wyoming.info import Describe

async def check(name, host, port):
    try:
        async with AsyncTcpClient(host, port) as client:
            await client.write_event(Describe().event())
            event = await asyncio.wait_for(client.read_event(), timeout=5)
            print(f"  {name:15} OK  ({event.type})")
    except Exception as e:
        print(f"  {name:15} FAIL  ({e})")

async def main():
    print("Grumpy Wyoming handshake test:")
    await check("piper",         "localhost", 10200)
    await check("whisper",       "localhost", 10300)
    await check("openwakeword",  "localhost", 10400)

asyncio.run(main())
PY
    ;;
  *)
    echo "Grumpy backend manager"
    echo "Usage: $0 {up|down|logs [service]|pull|restart [service]|status|gpu|test}"
    exit 1
    ;;
esac
