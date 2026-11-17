// Loads the app's real services (TypeScript, via the loader hooks) against a base URL.
//   boot()                 -> against an in-process fake ott-api that checks the OpenAPI contract
//   boot({ mock: true })   -> with no base URL, i.e. the built-in mock catalogue
//   boot({ baseUrl })      -> against a real server (used by the opt-in staging test)
import { register } from "node:module";
import { startFakeApi } from "./fake-api.mjs";

export async function boot({ mock = false, baseUrl } = {}) {
  register("./ts-loader.mjs", import.meta.url);
  const fake = baseUrl ? null : await startFakeApi();
  if (mock) {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_API_BASE_URL = baseUrl ?? fake.url;
  }
  const api = await import("../../services/api.ts");
  const session = await import("../../services/session.ts");
  const playback = await import("../../services/playbackService.ts");
  const catalog = await import("../../services/dramaService.ts");
  const { store } = await import("./stubs/expo-secure-store.mjs");
  return { fake, api, session, playback, catalog, store };
}
