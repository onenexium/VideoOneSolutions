// Viewer session: a guest session on first launch, refreshed with the stored refresh token.
// The access token lives in memory only (services/api.ts); the refresh token and the device
// ID live in the Keychain / Keystore via expo-secure-store, never in AsyncStorage.

import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  api,
  registerSessionHooks,
  setAccessToken,
  unwrap,
  USE_MOCK_API,
} from "./api";
import type { components } from "@/types/api";

type SessionResponse = components["schemas"]["SessionResponse"];
export type Viewer = SessionResponse["user"];

const DEVICE_ID_KEY = "onenexium_device_id";
const REFRESH_TOKEN_KEY = "onenexium_refresh_token";

let deviceId: string | null = null;
let viewer: Viewer | null = null;
const viewerListeners = new Set<() => void>();

function setViewer(next: Viewer | null) {
  viewer = next;
  viewerListeners.forEach((listener) => listener());
}

/** Calls `listener` whenever who is signed in changes (login, logout, a dead refresh). */
export function subscribeViewer(listener: () => void): () => void {
  viewerListeners.add(listener);
  return () => viewerListeners.delete(listener);
}
let pending: Promise<void> | null = null;
let refreshing: Promise<RefreshOutcome> | null = null;

/** Generated on first launch and kept; logging in again reuses the device. */
export async function getDeviceId(): Promise<string> {
  if (deviceId) {
    return deviceId;
  }
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  deviceId = id;
  return id;
}

export async function deviceInfo() {
  const version = Constants.expoConfig?.version ?? "";
  return {
    id: await getDeviceId(),
    platform: (Platform.OS === "ios" ? "ios" : "android") as "ios" | "android",
    // The API only accepts MAJOR.MINOR.PATCH.
    ...(/^\d+\.\d+\.\d+$/.test(version) ? { appVersion: version } : {}),
  };
}

/** Adopts a session the API issued (guest, login or refresh): token in memory, refresh token stored. */
export async function applySession(session: SessionResponse) {
  setAccessToken(session.accessToken);
  setViewer(session.user);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken);
}

async function startGuest() {
  const result = await api.POST("/v1/auth/guest", {
    body: { device: await deviceInfo() },
  });
  await applySession(unwrap(result));
}

/**
 * What a refresh came to:
 *  - "ok": a new token pair was issued;
 *  - "none": there is no refresh token (first launch, or logged out);
 *  - "invalid": the server refused the token (revoked, replayed, expired): it is dead, drop it;
 *  - "unavailable": no network, or the server could not answer: the token may still be good.
 * Only "invalid" ends the login. A bad connection must never log a member out or replace their
 * account with a new guest.
 */
type RefreshOutcome = "ok" | "none" | "invalid" | "unavailable";

async function refresh(): Promise<RefreshOutcome> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    return "none";
  }
  let result;
  try {
    result = await api.POST("/v1/auth/refresh", { body: { refreshToken } });
  } catch {
    return "unavailable"; // fetch threw: offline, DNS, timeout
  }
  if (result.data && result.error === undefined) {
    await applySession(result.data);
    return "ok";
  }
  if (result.response.status === 401) {
    // The refresh token is single use and may have been revoked: start over.
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setViewer(null);
    return "invalid";
  }
  return "unavailable"; // 5xx, 429, a proxy page: try again later with the same token
}

/** Refresh once at a time: two parallel 401s must not spend the same refresh token twice. */
function refreshOnce(): Promise<RefreshOutcome> {
  refreshing ??= refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Resolves true when a new token pair was issued. */
export async function refreshSession(): Promise<boolean> {
  return (await refreshOnce()) === "ok";
}

/** Make sure there is a session: restore from the refresh token, else start a guest. */
export function ensureSession(): Promise<void> {
  if (USE_MOCK_API) {
    return Promise.resolve();
  }
  pending ??= (async () => {
    const outcome = await refreshOnce();
    if (outcome === "ok") {
      return;
    }
    if (outcome === "unavailable") {
      // Keep the stored login for the next try: starting a guest now would overwrite it.
      throw new Error("Cannot reach the server to restore the session");
    }
    await startGuest();
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export function getViewer(): Viewer | null {
  return viewer;
}

/** The API returned the viewer afresh (profile change, deletion request): keep it. */
export function updateViewer(next: Viewer) {
  setViewer(next);
}

/** The refresh token kept on this device, if any. */
export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/** Drops the session on this device (call after POST /v1/auth/logout). */
export async function clearSession() {
  setAccessToken(null);
  setViewer(null);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

registerSessionHooks({ ensureSession, refreshSession });
