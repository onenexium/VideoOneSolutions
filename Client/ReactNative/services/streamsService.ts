// "Playing now": the account's active streams, so a viewer at the stream limit can stop one.

import { api, unwrap } from "./api";
import type { components } from "@/types/api";

export type Stream = components["schemas"]["StreamResponse"];

export async function getStreams(): Promise<Stream[]> {
  return unwrap(await api.GET("/v1/me/streams", {})).items;
}

/** Stops a stream; that device stops at its next heartbeat. */
export async function stopStream(id: string): Promise<void> {
  unwrap(await api.DELETE("/v1/me/streams/{id}", { params: { path: { id } } }));
}
