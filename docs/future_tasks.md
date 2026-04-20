# Future Tasks

Items to revisit when time allows or blockers are resolved.

## Spotify

- **Apply for Extended Quota Mode** — Submit the Spotify app at developer.spotify.com for extended access. This would allow reading individual tracks from playlists (currently returns 403 in Development Mode). Not needed for playback, just for displaying track listings in followed playlists.

## Dashboard

- **Config persistence for production** — Current config saves to a local `config.json` via the Vite dev server. For production (served from nginx or HA), need a proper persistence backend (HA entity, REST API, or file-write endpoint).

- **YouTube Music integration** — Provider slot exists in the music widget but no API implementation yet.

- **Apple Music integration** — Provider slot exists but no API implementation yet.

- **Photo widget: Google Photos support** — Currently supports Immich and local folder. Google Photos API requires OAuth.

- **HA entity widget: auto-discover entities** — Currently requires manually entering entity IDs. Could query HA for available entities and show a picker.

## Infrastructure

- **Spotify app redirect URI cleanup** — Currently using `http://127.0.0.1:5173/spotify-callback` (dev server). For production, will need a stable callback URL or a different auth flow.
