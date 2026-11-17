import { useSyncExternalStore } from "react";
import { getViewer, subscribeViewer } from "@/services/session";

/** Who is signed in (guest or member); re-renders when it changes. Null until a session exists. */
export function useViewer() {
  return useSyncExternalStore(subscribeViewer, getViewer, getViewer);
}
