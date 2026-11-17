// Coins: the wallet, unlocking episodes, auto-unlock, and the daily check-in.
//
// Rules the screens rely on (docs/MONEY-PLAN.md):
//  - an unlock is sent with the price the viewer was shown (`expectedCoins`); if the price moved the
//    server answers 409 price-changed and charges nothing, so what is shown is what is charged;
//  - every money write carries an Idempotency-Key made once per user intent and reused on a retry,
//    so a double tap or a retry after a lost answer charges once;
//  - money is never cached: every read goes to the server.

import * as Crypto from "expo-crypto";
import { api, ApiError, unwrap } from "./api";
import type { components } from "@/types/api";

export type Wallet = components["schemas"]["WalletResponse"];
export type WalletBalance = components["schemas"]["WalletBalanceResponse"];
export type WalletEntry = components["schemas"]["WalletEntryResponse"];
export type UnlockResult = components["schemas"]["UnlockResponse"];
export type CheckInState = components["schemas"]["CheckInStateResponse"];
export type ClaimResult = components["schemas"]["ClaimResponse"];

/** One key per intent ("unlock episode 7"), kept until the intent is finished, reused on retries. */
export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

export async function getWallet(): Promise<Wallet> {
  return unwrap(await api.GET("/v1/me/wallet", {}));
}

export async function getWalletHistory(cursor?: string) {
  return unwrap(await api.GET("/v1/me/wallet/history", { params: { query: { cursor } } }));
}

export async function getCheckIn(): Promise<CheckInState> {
  return unwrap(await api.GET("/v1/me/rewards", {})).checkIn;
}

/** Claims today's check-in. Retrying with the same key returns the first result. */
export async function claimCheckIn(idempotencyKey: string): Promise<ClaimResult> {
  return unwrap(
    await api.POST("/v1/me/checkins", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
    }),
  );
}

/**
 * Unlocks one episode, or (no `episode`) the series' locked, released episodes, at `expectedCoins`.
 * "already-yours" means nothing was charged: play it.
 */
export async function unlock(input: {
  series: string;
  episode?: number;
  expectedCoins: number;
  idempotencyKey: string;
}): Promise<UnlockResult> {
  return unwrap(
    await api.POST("/v1/unlocks", {
      params: { header: { "Idempotency-Key": input.idempotencyKey } },
      body: { series: input.series, episode: input.episode, expectedCoins: input.expectedCoins },
    }),
  );
}

/** Undoes an auto-unlock (the toast's Undo): the coins come back and the episode is locked again. */
export async function undoUnlock(unlockId: string, idempotencyKey = newIdempotencyKey()) {
  return unwrap(
    await api.POST("/v1/unlocks/{id}/undo", {
      params: { path: { id: unlockId }, header: { "Idempotency-Key": idempotencyKey } },
    }),
  );
}

export async function setAutoUnlock(series: string, on: boolean): Promise<void> {
  const params = { params: { path: { shortId: series } } };
  unwrap(await (on ? api.PUT("/v1/me/auto-unlock/{shortId}", params) : api.DELETE("/v1/me/auto-unlock/{shortId}", params)));
}

/** Why an unlock was refused, in the terms the sheet speaks. Null for anything else. */
export type UnlockRefusal =
  | { reason: "price-changed"; coins: number }
  | { reason: "insufficient-coins" }
  | { reason: "wallet-in-debt" }
  | { reason: "login-needed" };

export function refusalOf(error: unknown): UnlockRefusal | null {
  if (!(error instanceof ApiError)) return null;
  switch (error.type.replace("urn:ott:error:", "")) {
    case "price-changed": {
      const coins = error.problem.coins;
      return typeof coins === "number" ? { reason: "price-changed", coins } : null;
    }
    case "insufficient-coins":
      return { reason: "insufficient-coins" };
    case "wallet-in-debt":
      return { reason: "wallet-in-debt" };
    case "guest-not-allowed":
      return { reason: "login-needed" };
    default:
      return null;
  }
}
