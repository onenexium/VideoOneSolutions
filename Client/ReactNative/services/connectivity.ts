// Whether the API can be reached, judged from the requests themselves: a request that gets no
// response at all (offline, timeout) marks the app offline; any response, even an error, means the
// network works. No native module is needed, and it cannot disagree with what the app really sees.

let offline = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === offline) return;
  offline = next;
  listeners.forEach((listener) => listener());
}

export const isOffline = () => offline;
export const markOffline = () => set(true);
export const markOnline = () => set(false);

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
