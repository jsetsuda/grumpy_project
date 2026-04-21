# Future Tasks

Items to revisit when time allows or blockers are resolved.

## Spotify

- **Apply for Extended Quota Mode** — Submit the Spotify app at developer.spotify.com for extended access. This would allow reading individual tracks from playlists (currently returns 403 in Development Mode). Not needed for playback, just for displaying track listings in followed playlists.

## Music Players

- **YouTube Music integration** — Provider slot exists in the music widget but no API implementation yet. YouTube Music doesn't have a public API — options:
  1. Use youtube-music-api (unofficial) or ytmusicapi
  2. Embed YouTube Music via iframe (limited control)
  3. Use HA media_player integration as a proxy

- **Apple Music / iTunes integration** — Provider slot exists. Options:
  1. MusicKit JS (Apple's official web SDK) — requires Apple Developer Program membership ($99/yr)
  2. Embed via iframe
  3. Use HA media_player integration

## Video Widgets

- **YouTube Video Widget** — Embed YouTube player in a widget. Options:
  1. YouTube IFrame API (free, works in browsers) — search, browse, play videos
  2. Voice command: "play [video] on YouTube" → search YouTube API, embed top result
  3. Need YouTube Data API key for search

- **Streaming Service Widgets (Hulu, Prime Video, Netflix, Disney+)** — These do NOT have public APIs for playback. Options:
  1. Cast/control via HA media_player entities (if using Chromecast, Fire TV, etc.)
  2. Open streaming app on a connected device via HA automation
  3. Voice command: "play [show] on Hulu" → trigger HA automation that opens the app on a TV/Fire Stick
  4. Cannot embed these directly in a browser due to DRM restrictions

- **Plex/Jellyfin Widget** — Self-hosted media. Both have APIs:
  1. Plex has a web player and API
  2. Jellyfin has an open API and web player
  3. Could build a browse/play widget similar to the Spotify one

## Voice Commands — New Features

- **Voice-activated video** — "Play [video] on YouTube" → search + embed in an overlay
  - Needs YouTube Data API v3 key
  - Display as a fullscreen or large overlay that can be dismissed

- **Voice timer/alarm** — "Set a timer for 5 minutes" / "Set an alarm for 7am"
  - Parse duration from transcript (regex: X minutes, X hours, X seconds)
  - Show countdown overlay (large, centered, always on top)
  - Play alarm sound when done (use Web Audio API or an audio file)
  - Visual alert (pulsing, color change)
  - Voice dismissable: "Stop timer" / "Cancel alarm"
  - Multiple concurrent timers support
  - Integrate with HA timer entities as well

- **Voice-controlled streaming** — "Play [show] on [service]"
  - Route through HA media_player entities
  - Requires HA integrations for each service (Chromecast, Fire TV, etc.)

## Voice

- **Custom Piper voice training** — Use Piper's training toolkit to create a custom "Grumpy" voice. Needs ~30-60 min of clean audio recordings + the 3090 for training. Produces an .onnx model to drop into `backend/data/piper/`. Two approaches:
  1. Fine-tune/clone an existing voice (easier, less data needed)
  2. Train from scratch using full VITS pipeline (more data, fully custom)
  - Training repo: https://github.com/rhasspy/piper (see training docs)
  - Runs on the backend VM's 3090

## Dashboard

- **Config persistence for production** — Current config saves to a local `config.json` via the Vite dev server. For production (served from nginx or HA), need a proper persistence backend (HA entity, REST API, or file-write endpoint).

- **HA entity widget: auto-discover entities** — ✅ DONE

- **Photo widget: Google Photos support** — ✅ DONE (OAuth flow built)

## Infrastructure

- **Spotify app redirect URI cleanup** — Currently using `http://127.0.0.1:5173/spotify-callback` (dev server). For production, will need a stable callback URL or a different auth flow.

## Priority Build Order

1. **Voice timer/alarm** — High value, no external API needed, builds on existing voice system
2. **YouTube video widget** — YouTube IFrame API is free and works in browsers
3. **YouTube Music player** — Extends the music widget
4. **Apple Music (MusicKit JS)** — If Apple Developer membership available
5. **Plex/Jellyfin widget** — For self-hosted media
6. **Streaming voice commands** — Via HA media_player entities
