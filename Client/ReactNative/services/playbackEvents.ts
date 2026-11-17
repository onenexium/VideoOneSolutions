// Things the player learns from the API that the screen around it must react to, without
// threading callbacks through every layer of the player: an episode was unlocked automatically when
// playback started (show "Episode N unlocked. Undo"), or the API says an episode must be unlocked.

export interface AutoUnlockedEvent {
  series: string;
  unlockId: string;
  episode: number;
  coins: number;
}

export interface LockedEvent {
  series: string;
  episode: number;
}

export interface OpenedEvent {
  series: string;
  episode: number;
  /** The effective rating, for the rating card. */
  rating: "U" | "UA7" | "UA13" | "UA16" | "A";
}

type Listener<T> = (event: T) => void;

function channel<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit(event: T) {
      listeners.forEach((listener) => listener(event));
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const autoUnlocked = channel<AutoUnlockedEvent>();
export const locked = channel<LockedEvent>();
export const opened = channel<OpenedEvent>();
