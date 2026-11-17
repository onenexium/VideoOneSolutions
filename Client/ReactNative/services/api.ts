// Typed client for ott-api (REST /v1, JSON, Bearer JWT, problem+json errors).
// Types in types/api.d.ts are generated from openapi/viewer.json (`npm run api:types`).
// The base URL comes from the environment, never hard-coded:
//   EXPO_PUBLIC_API_BASE_URL=https://api.example.com
// Leave it unset to run on the built-in mock catalogue (services/mockCatalog.ts).

import createClient, { type Middleware } from "openapi-fetch";
import { Platform } from "react-native";
import type { paths } from "@/types/api";
import { requireUpdate } from "./appGate";
import { markOffline, markOnline } from "./connectivity";
import { appVersion } from "./version";

export const API_BASE_URL: string = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? ""
).replace(/\/+$/, "");

/** True when no real backend is configured and mock data should be used. */
export const USE_MOCK_API = API_BASE_URL === "";

/** Error body shape returned by ott-api (application/problem+json). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: string[];
  requestId?: string;
  [extra: string]: unknown;
}

export class ApiError extends Error {
  constructor(public problem: ProblemDetails) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
  }

  get status() {
    return this.problem.status;
  }

  /** The machine-readable error, e.g. "urn:ott:error:not-entitled". Branch on this. */
  get type() {
    return this.problem.type;
  }
}

function toProblem(error: unknown, response: Response): ProblemDetails {
  if (error && typeof error === "object" && "status" in error) {
    return error as ProblemDetails;
  }
  return {
    type: "about:blank",
    title: response.statusText || "Request failed",
    status: response.status,
  };
}

/** Returns `data` or throws ApiError built from the problem+json body. */
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.error !== undefined || result.data === undefined) {
    // 204 responses have no body: treat a successful empty response as success.
    if (result.response.ok && result.error === undefined) {
      return undefined as T;
    }
    throw new ApiError(toProblem(result.error, result.response));
  }
  return result.data;
}

/** The two hooks the session module registers (avoids a circular import). */
interface SessionHooks {
  /** Make sure a token exists (guest or logged in) before an authenticated request. */
  ensureSession: () => Promise<void>;
  /** Swap the refresh token for a new pair. Resolves false when the user must log in again. */
  refreshSession: () => Promise<boolean>;
}

let accessToken: string | null = null;
let hooks: SessionHooks | null = null;

/** Keep the access token in memory only; the refresh token goes to secure storage. */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function registerSessionHooks(next: SessionHooks) {
  hooks = next;
}

const isAuthPath = (path: string) => path.startsWith("/v1/auth/");
const retryCopies = new Map<string, Request>();

const middleware: Middleware = {
  async onRequest({ request, schemaPath, id }) {
    request.headers.set("x-platform", Platform.OS === "ios" ? "ios" : "android");
    // Once the API has a minimum build, a request without a valid version counts as too old.
    const version = appVersion();
    if (version) request.headers.set("x-app-version", version);
    if (!isAuthPath(schemaPath)) {
      if (!accessToken && hooks) {
        try {
          await hooks.ensureSession();
        } catch {
          // Open endpoints still work without a session.
        }
      }
      // Keep a copy so one 401 can be retried with a fresh token.
      retryCopies.set(id, request.clone());
    }
    // /v1/auth/* is public: never send a (possibly expired) bearer token to it.
    if (accessToken && !isAuthPath(schemaPath)) {
      request.headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return request;
  },
  async onResponse({ response, schemaPath, id }) {
    const copy = retryCopies.get(id);
    retryCopies.delete(id);
    markOnline(); // an answer of any kind: the network works
    if (response.status === 426) {
      requireUpdate(); // this build is no longer supported: the app shows its update screen
      return undefined;
    }
    if (response.status !== 401 || !copy || isAuthPath(schemaPath) || !hooks) {
      return undefined;
    }
    if (!(await hooks.refreshSession())) {
      return undefined;
    }
    copy.headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(copy);
  },
  // A request that never got a response (offline, timeout) must not leave its retry copy behind.
  onError({ id }) {
    retryCopies.delete(id);
    markOffline();
    return undefined;
  },
};

/** For tests: requests still holding a retry copy (must be 0 when nothing is in flight). */
export const pendingRetryCopies = () => retryCopies.size;

export const api = createClient<paths>({ baseUrl: API_BASE_URL });
api.use(middleware);
