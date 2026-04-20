# Grumpy Backend — Phase 1 Voice Stack

Docker Compose stack deployed on the Grumpy Backend VM. Provides
Wyoming Protocol services to the Home Assistant VM's Assist pipeline.

## Runs On

The **Grumpy Backend VM** — a Proxmox VM with RTX 3090 GPU
passthrough. Not the HA VM, not the Pi. See [`../README.md`](../README.md)
for the full architecture.

## What This Deploys

| Service       | Role                  | Port  | Compute | Image                                    |
|---------------|-----------------------|-------|---------|------------------------------------------|
| Whisper       | Speech-to-Text        | 10300 | **GPU** | `lscr.io/linuxserver/faster-whisper:gpu` |
| Piper         | Text-to-Speech        | 10200 | CPU     | `rhasspy/wyoming-piper`                  |
| openWakeWord  | Wake word detection   | 10400 | CPU     | `rhasspy/wyoming-openwakeword`           |

## Backend VM Prerequisites

All of these happen on the Backend VM, not the HA VM.

### 1. NVIDIA drivers

The VM must see the 3090:

```bash
nvidia-smi
```

Should print a GPU table. If not, the Proxmox GPU passthrough isn't
configured or the NVIDIA drivers aren't installed in the VM. See
Proxmox's PCI passthrough docs and `apt install nvidia-driver` for
your distribution.

### 2. Docker Engine + Compose

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# log out and back in, or run `newgrp docker`
```

### 3. NVIDIA Container Toolkit

This is what lets Docker containers see the GPU. Without this, the
Whisper container will fail to start with a CUDA error.

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Verify containers can see the GPU:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

If this prints the GPU table, you're ready. If not, fix this before
proceeding — the Whisper container won't work.

## Deploy

From this `backend/` directory on the VM:

```bash
cp .env.example .env
# review/edit .env as needed — defaults are tuned for the 3090
./manage.sh up
```

First startup downloads the Whisper model (`large-v3` is ~3GB). Watch
progress:

```bash
./manage.sh logs whisper
```

## Verify

```bash
./manage.sh status    # containers + port reachability
./manage.sh gpu       # GPU visible from host AND inside Whisper container
./manage.sh test      # Wyoming handshake (needs: pip install wyoming)
```

## Wire Into Home Assistant

On the **HA VM**:

1. **Settings → Devices & services → Add integration**
2. Search for **Wyoming Protocol**
3. Add it three times, once per service. Use the Backend VM's IP:
   - Host: `<backend-vm-ip>`, Port: `10200` (Piper)
   - Host: `<backend-vm-ip>`, Port: `10300` (Whisper)
   - Host: `<backend-vm-ip>`, Port: `10400` (openWakeWord)

Each registers automatically.

### Create the Assist pipeline

1. **Settings → Voice assistants → Add assistant**
2. Fill in:
   - Name: `Grumpy`
   - Conversation agent: `Home Assistant` (Phase 2 will swap to Ollama/Claude)
   - Speech-to-text: `faster-whisper`
   - Text-to-speech: `piper` (pick your voice)
   - Wake word: `openWakeWord` → `ok_nabu`
3. Save, and set as default.

## Test End-to-End

Open the HA companion app on your phone, tap the Assist icon, and say:

> "Turn on the living room lights"
>
> "What time is it?"

If HA transcribes, responds, and speaks back, **Phase 1 is done**.

## Troubleshooting

**Whisper container exits with CUDA error**
NVIDIA Container Toolkit step was missed or Docker wasn't restarted.
Re-run step 3 of prereqs, then `./manage.sh restart whisper`.
`./manage.sh gpu` is the diagnostic.

**HA can't connect to Wyoming Protocol**
Firewall on the Backend VM. Either open 10200/10300/10400 to the HA
VM's IP, or disable ufw on the Backend VM if it's not doing anything
else.

**Whisper runs but is slow**
Check `./manage.sh gpu` — the container must see the 3090. CTranslate2
silently falls back to CPU if CUDA libs are missing from the container.

**Model downloads hang**
HuggingFace can be flaky. `./manage.sh logs whisper` will show download
progress. Restart the service if truly stuck — it resumes from cache.

**openWakeWord never fires**
Wake detection happens on the *input device* side (phone companion app
during Phase 1, Pi during Phase 5). Make sure wake-on is enabled in
the companion app's Assist settings.

## Phase 2 Preview

When Phase 1 is validated, Phase 2 adds an `ollama` service to this
same `docker-compose.yml`, shares the 3090, and registers in HA as a
conversation agent. No new infrastructure — just a new service in the
existing stack. See [`../CLAUDE.md`](../CLAUDE.md) for the Phase 2
plan.
