// What the app reads at start (GET /v1/app-config): feature switches, the oldest and newest build,
// maintenance. Revalidated with the last ETag (an unchanged config is a 304 with no body). The last
// good config is kept on the phone, so a start with no network still knows the switches, and a
// failed fetch never blocks the app: only the config or a 426 can.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { requireUpdate, setLoginPolicy, setMaintenance, setUpdateAvailable } from "./appGate";
import { appVersion, isOlderVersion } from "./version";
import type { components } from "@/types/api";

export type AppConfig = components["schemas"]["AppConfigResponse"];

const CACHE_KEY = "onenexium_app_config";
const DISMISSED_KEY = "onenexium_update_dismissed";

interface Cached {
  etag: string | null;
  config: AppConfig;
}

let current: Cached | null = null;
let loaded = false;

async function readCache(): Promise<Cached | null> {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Cached) : null;
    current = parsed?.config ? parsed : null;
  } catch {
    current = null;
  }
  return current;
}

async function apply(config: AppConfig) {
  const version = appVersion();
  setMaintenance(config.maintenance.enabled ? { message: config.maintenance.message } : null);
  setLoginPolicy(!config.guestMode, config.loginPrompt === "launch");
  if (version && config.minVersion && isOlderVersion(version, config.minVersion)) {
    requireUpdate();
  }
  const latest = config.latestVersion;
  if (version && latest && isOlderVersion(version, latest)) {
    const dismissed = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null);
    setUpdateAvailable(dismissed === latest ? null : latest);
  } else {
    setUpdateAvailable(null);
  }
}

/** Fetches (or revalidates) the config and applies it. Resolves with the config in force, or null. */
export async function loadAppConfig(): Promise<AppConfig | null> {
  const cached = await readCache();
  try {
    const result = await api.GET("/v1/app-config", {
      params: { header: { "If-None-Match": cached?.etag ?? undefined } },
    });
    if (result.response.status === 304 && cached) {
      await apply(cached.config);
      return cached.config;
    }
    if (result.data) {
      current = { etag: result.response.headers.get("etag"), config: result.data };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(current)).catch(() => undefined);
      await apply(result.data);
      return result.data;
    }
  } catch {
    // Offline or a hiccup: carry on with what was kept.
  }
  if (cached) await apply(cached.config);
  return cached?.config ?? null;
}

/** "Not now" on the soft update prompt: not asked again for this version. */
export async function dismissUpdate(version: string) {
  setUpdateAvailable(null);
  await AsyncStorage.setItem(DISMISSED_KEY, version).catch(() => undefined);
}

/** A feature switch from the config; off when the name is missing or no config is known. */
export function isFeatureOn(name: string): boolean {
  return current?.config.featureFlags[name] === true;
}

/** For tests: forget the config held in memory, as a new start of the app would. */
export function forgetAppConfigInMemory() {
  current = null;
  loaded = false;
}
