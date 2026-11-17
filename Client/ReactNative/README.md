# Onenexium — ott-mobile

Short vertical drama streaming app for Android and iOS (Expo + React Native + TypeScript).

Playback runs on [`expo-video`](https://docs.expo.dev/versions/latest/sdk/video/) and the app
talks to `ott-api`.

## Run it

This app has native modules (Google Cast, `expo-video`), so it needs a development build,
not Expo Go.

```bash
npm install
eas build --profile development --platform android   # once, installs the dev client
npx expo start --dev-client --tunnel                  # then open the app and enter the URL
```

## Configuration

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `ott-api` base URL. When unset, the app runs on the mock catalogue in `services/mockCatalog.ts`. |

Never commit secrets; only public keys belong in `EXPO_PUBLIC_*` variables.

`.env` points at staging (`https://ott-api-staging.onenexium.com`). Empty it to use the mock catalogue.

## API contract

The typed client is generated from the backend's OpenAPI document:

```bash
cp ../../../projects/ott/ott-backend/openapi/viewer.json openapi/viewer.json   # when the API changes
npm run api:types                                                              # regenerates types/api.d.ts
```

Tests (`npm test`) run offline against a fake server that validates every request and response
against `openapi/viewer.json`. To also run them against a real server:

```bash
OTT_API_URL=https://ott-api-staging.onenexium.com node --test tests/staging-live.test.mjs
```

## Layout

```
app/          expo-router screens (home, channel/feed, player)
components/   player, cast, drama cards, modals, shared UI
services/     api.ts (ott-api client), dramaService.ts, mockCatalog.ts, userService.ts
hooks/        data and cast hooks
types/        shared types (DramaEpisode.sources is the playable URL list)
plugins/      Expo config plugin for Google Cast
tests/        source-level regression tests (`node --test tests/`)
```

## Next steps

- Replace the mock catalogue with the generated OpenAPI client.
- DRM playback sessions (`POST /v1/playback/sessions`, Widevine / FairPlay via `expo-video`).
- Phone OTP login with tokens in `expo-secure-store`.
- Paywall, coins, VIP and rewarded ads (all granted by the server).
