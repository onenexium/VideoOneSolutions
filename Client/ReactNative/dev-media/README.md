# dev-media

Vertical test videos for trying the player without a backend. Served by the Metro dev server at
`/dev-media/<name>.mp4` (see `scripts/dev-media-middleware.js`) and used by the mock catalogue
(`services/mockCatalog.ts`) when `EXPO_PUBLIC_API_BASE_URL` is empty. The `.mp4` files are not
committed.

`ep1.mp4` .. `ep4.mp4` are 720x1280 H.264 episodes of 75 to 85 seconds, joined from free
vertical stock clips from Mixkit (https://mixkit.co/free-stock-video/vertical/), used under the
Mixkit Stock Video Free License. Source clips: see `manifest.json`.
