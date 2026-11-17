// expo-video releases the native player as soon as its component unmounts. Cleanup code that
// runs afterwards (pause on blur, removing listeners, background/foreground handlers) then
// throws "Cannot use shared object that was already released". That is expected during
// teardown, not a bug to show the user, so those calls go through callPlayer().
// Every other error is rethrown unchanged.

const RELEASED = /already released/i;

export function isReleasedPlayerError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error);
  return RELEASED.test(text);
}

/** Runs a call on a player that may already have been released; ignores only that case. */
export function callPlayer(call: () => void): void {
  try {
    call();
  } catch (error) {
    if (!isReleasedPlayerError(error)) {
      throw error;
    }
  }
}
