import SvgIcon from "@/components/ui/SvgIcon";
import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  AppState,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DramaEpisode, PlaybackSource } from "@/types/drama";
import { pickDefaultSource } from "@/utils/dramaUtils";
import { callPlayer } from "@/utils/safePlayer";
import { ApiError } from "@/services/api";
import { setLiked } from "@/services/libraryService";
import PinPad from "./PinPad";
import {
  PlaybackService,
  type HeartbeatState,
  type PlaybackSession,
} from "@/services/playbackService";
import PlaybackControls from "./PlaybackControls";
import SeekBar from "./SeekBar";
import {
  AirPlayRelay,
  type AirPlaySessionSnapshot,
  type AirPlaySessionState,
} from "../cast/AirPlayRelay";
import { colors } from "@/constants/theme";

// Get screen dimensions, swap width and height in landscape mode
const getScreenDimensions = () => {
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  return { width: screenWidth, height: screenHeight };
};

interface VideoPlayerProps {
  episode: DramaEpisode;
  dramaTitle: string;
  dramaCoverUrl: string;
  currentIndex: number; // Current active index from FlatList
  episodes?: DramaEpisode[];
  currentEpisodeIndex?: number;
  playerIndex?: number;
  onPlayPause?: (isPlaying: boolean) => void;
  onProgress?: (progress: number) => void;
  onSeekingChange?: (seeking: boolean) => void;
  onError?: (error: string) => void;
  onFullscreen?: (isFullscreen?: boolean, index?: number) => void; // Fullscreen button click callback
  onDidFinish?: () => void; // Callback when video finishes playing
  dramaId?: string;
  dramaVideoOrientation?: number;
  startTime?: number;
  playbackSpeed?: number; // Playback speed
  onSpeedChange?: (speed: number) => void; // Speed change callback
  onEpisodeSelect?: (index: number) => void; // Episode selection callback
  isFeedTab?: boolean; // Feed tab indicator
  /**
   * Fired whenever the active video URL or quality changes.
   * The parent can use this to supply the correct URL to CastButton.
   */
  onPlayUrlChange?: (url: string, currentTime: number) => void;
  /** Android Google Cast state from the parent page. */
  isRemoteCasting?: boolean;
  /** Android remote playback position in seconds. */
  remoteCastPosition?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  episode,
  dramaTitle,
  dramaCoverUrl,
  currentIndex,
  episodes = [],
  currentEpisodeIndex = 0,
  playerIndex = 0,
  onPlayPause,
  onProgress,
  onSeekingChange,
  onError,
  onFullscreen,
  onDidFinish,
  dramaId = "",
  dramaVideoOrientation = 0,
  startTime = 0,
  playbackSpeed = 1.0,
  onSpeedChange,
  onEpisodeSelect,
  isFeedTab = false,
  onPlayUrlChange,
  isRemoteCasting = false,
  remoteCastPosition = 0,
}) => {
  const insets = useSafeAreaInsets();
  const isScreenFocused = useIsFocused();

  // Calculate isActive internally based on playerIndex and currentIndex
  const isActive = useMemo(() => {
    return playerIndex === currentIndex;
  }, [playerIndex, currentIndex]);

  // One expo-video player per list item. It holds no source until the item becomes active,
  // and drops it again when the item scrolls away.
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
    p.keepScreenOnWhilePlaying = true;
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(episode?.duration || 0);
  const [error, setError] = useState<string | null>(null);
  // A message from ott-api (e.g. "not entitled") is shown as is; anything else is a network error.
  const [errorFromApi, setErrorFromApi] = useState(false);
  // The API asked for the parental PIN: show the PIN pad instead of the error.
  const [pinRequired, setPinRequired] = useState(false);
  const [showPoster, setShowPoster] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentLikeCount, setCurrentLikeCount] = useState(episode?.like || 0);
  const [isLiked, setIsLiked] = useState(episode?.liked ?? false);
  const episodeVidRef = useRef(episode?.vid);
  episodeVidRef.current = episode?.vid;
  const [currentQuality, setCurrentQuality] = useState<string>("");
  const [currentSource, setCurrentSource] = useState<PlaybackSource | null>(
    null,
  );
  const [showLoading, setShowLoading] = useState(false);
  const [availableSources, setAvailableSources] = useState<PlaybackSource[]>(
    [],
  );
  const [containerHeight, setContainerHeight] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [currentOrientation, setCurrentOrientation] =
    useState<ScreenOrientation.Orientation>(
      ScreenOrientation.Orientation.PORTRAIT_UP,
    );
  const [screenDimensions, setScreenDimensions] = useState(
    getScreenDimensions(),
  );
  const stalledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentOrientationRef = useRef<ScreenOrientation.Orientation>(
    ScreenOrientation.Orientation.PORTRAIT_UP,
  );
  const loadGenerationRef = useRef(0);
  const openGenerationRef = useRef(0);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatSequenceRef = useRef(0);
  const showLoadingRef = useRef(false);
  const hasSourceRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isActiveRef = useRef(false);
  const isScreenFocusedRef = useRef(isScreenFocused);
  const currentTimeRef = useRef(0);
  const currentPlayUrlRef = useRef<string | undefined>(undefined);
  const playbackSpeedRef = useRef(playbackSpeed);
  const startTimeRef = useRef(startTime);
  const episodeRef = useRef(episode);
  const airPlaySessionStateRef = useRef<AirPlaySessionState>("idle");
  const airPlayGenerationRef = useRef(0);
  const localWasPlayingBeforeAirPlayRef = useRef(false);
  const localMutedForAirPlayRef = useRef(false);
  const lastAirPlayResumePositionRef = useRef(0);
  const androidCastingRef = useRef(false);
  const androidRemotePositionRef = useRef(0);

  // Keep duration in sync with episode metadata
  useEffect(() => {
    setDuration(episode?.duration || 0);
  }, [episode?.duration]);

  // Notify parent when the video URL changes (quality switch, episode switch, etc.)
  // so the parent can pass the correct URL to CastButton.
  useEffect(() => {
    if (currentSource?.url) {
      onPlayUrlChange?.(currentSource.url, currentTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSource?.url]);

  useEffect(() => {
    const initializeOrientation = async () => {
      try {
        const orientation = await ScreenOrientation.getOrientationAsync();
        setCurrentOrientation(orientation);
        currentOrientationRef.current = orientation;
      } catch (error) {
        console.error("Failed to get initial orientation:", error);
      }
    };

    initializeOrientation();

    const subscription = ScreenOrientation.addOrientationChangeListener(
      (event) => {
        const newOrientation = event.orientationInfo.orientation;
        const prevOrientation = currentOrientationRef.current;
        if (
          dramaVideoOrientation === 1 &&
          newOrientation === ScreenOrientation.Orientation.PORTRAIT_UP &&
          prevOrientation !== ScreenOrientation.Orientation.PORTRAIT_UP
        ) {
          ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP,
          );
        }
        setCurrentOrientation(newOrientation);
        currentOrientationRef.current = newOrientation;
        setScreenDimensions(getScreenDimensions());
      },
    );

    return () => {
      subscription.remove();
    };
  }, [dramaVideoOrientation]);

  const shouldPauseLocalPlayback = useCallback(
    () =>
      airPlaySessionStateRef.current === "casting" ||
      airPlaySessionStateRef.current === "stopping" ||
      androidCastingRef.current,
    [],
  );

  const isRemotePlaybackActive = useCallback(
    () => shouldPauseLocalPlayback(),
    [shouldPauseLocalPlayback],
  );

  useEffect(() => {
    setCurrentLikeCount(episode?.like || 0);
  }, [episode?.like]);

  // The liked state follows the episode (the viewer's likes come with the episode list).
  useEffect(() => {
    setIsLiked(episode?.liked ?? false);
  }, [episode?.vid, episode?.liked]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    if (hasSourceRef.current && !episode.vip) {
      player.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, episode.vip, player]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    showLoadingRef.current = showLoading;
  }, [showLoading]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    isScreenFocusedRef.current = isScreenFocused;
  }, [isScreenFocused]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    currentPlayUrlRef.current = currentSource?.url;
  }, [currentSource?.url]);

  useEffect(() => {
    episodeRef.current = episode;
  }, [episode]);

  useEffect(() => {
    androidRemotePositionRef.current = remoteCastPosition;
  }, [remoteCastPosition]);

  const clearStalledTimer = useCallback(() => {
    if (stalledTimerRef.current) {
      clearTimeout(stalledTimerRef.current);
      stalledTimerRef.current = null;
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // Report the position; the API frees the stream slot or revokes the session from this.
  const sendHeartbeat = useCallback(
    (forcedState?: HeartbeatState) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const state: HeartbeatState =
        forcedState ??
        (!isPlayingRef.current
          ? "paused"
          : showLoadingRef.current
            ? "buffering"
            : "playing");
      PlaybackService.heartbeat(
        session.id,
        currentTimeRef.current,
        ++heartbeatSequenceRef.current,
        state,
      )
        .then((ok) => {
          if (ok || sessionRef.current !== session) {
            return;
          }
          // Revoked: stopped from another device, ended, or out of time.
          sessionRef.current = null;
          stopHeartbeat();
          callPlayer(() => player.pause());
          isPlayingRef.current = false;
          setIsPlaying(false);
          onPlayPause?.(false);
          setErrorFromApi(true);
          setError("Playback stopped on this device");
        })
        .catch(() => {
          // A missed heartbeat is retried on the next tick.
        });
    },
    [player, onPlayPause, stopHeartbeat],
  );

  // End the API session (frees the stream slot). Safe to call when there is none.
  const endSession = useCallback(() => {
    stopHeartbeat();
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      PlaybackService.end(
        session.id,
        currentTimeRef.current,
        ++heartbeatSequenceRef.current,
      ).catch(() => {});
    }
  }, [stopHeartbeat]);

  // Load a URL into the player and start it (unless a remote device is playing).
  const loadSource = useCallback(
    async (url: string, resumeAt: number) => {
      const generation = ++loadGenerationRef.current;
      try {
        await player.replaceAsync({ uri: url });
        if (generation !== loadGenerationRef.current) {
          return;
        }
        hasSourceRef.current = true;
        player.playbackRate = playbackSpeedRef.current;
        if (resumeAt > 0) {
          player.currentTime = resumeAt;
        }
        if (!shouldPauseLocalPlayback()) {
          player.play();
          isPlayingRef.current = true;
          setIsPlaying(true);
        }
      } catch (e) {
        if (generation !== loadGenerationRef.current) {
          return;
        }
        const message = e instanceof Error ? e.message : "Playback error";
        console.error("VideoPlayer: failed to load source", e);
        setError(message);
        onError?.(message);
      }
    },
    [player, shouldPauseLocalPlayback, onError],
  );

  // Drop the loaded source so inactive list items hold no decoder resources.
  const releaseSource = useCallback(() => {
    loadGenerationRef.current++;
    openGenerationRef.current++;
    endSession();
    clearStalledTimer();
    if (hasSourceRef.current) {
      hasSourceRef.current = false;
      try {
        player.pause();
        player.replaceAsync(null).catch(() => {});
      } catch {
        // player may already be released while unmounting
      }
    }
  }, [player, clearStalledTimer, endSession]);

  // Player events
  useEffect(() => {
    const subscriptions = [
      player.addListener("playingChange", ({ isPlaying: playing }) => {
        if (!isActiveRef.current || !hasSourceRef.current) {
          return;
        }
        if (playing && shouldPauseLocalPlayback()) {
          player.muted = true;
          player.pause();
          isPlayingRef.current = false;
          setIsPlaying(false);
          onPlayPause?.(false);
          return;
        }
        isPlayingRef.current = playing;
        setIsPlaying(playing);
        onPlayPause?.(playing);
        if (!playing) {
          sendHeartbeat("paused");
        }
      }),
      player.addListener("statusChange", ({ status, error: statusError }) => {
        if (!isActiveRef.current || !hasSourceRef.current) {
          return;
        }
        if (status === "loading") {
          // Only show the spinner when buffering lasts a moment
          clearStalledTimer();
          stalledTimerRef.current = setTimeout(() => {
            setShowLoading(true);
          }, 200);
        } else {
          clearStalledTimer();
          setShowLoading(false);
        }
        if (status === "error") {
          const message = statusError?.message || "Playback error";
          console.error("VideoPlayer: playback error", message);
          setError(message);
          onError?.(message);
        }
      }),
      player.addListener("sourceLoad", ({ duration: loadedDuration }) => {
        if (loadedDuration > 0) {
          setDuration(loadedDuration);
        }
      }),
      player.addListener("timeUpdate", ({ currentTime: time }) => {
        if (!isActiveRef.current || !hasSourceRef.current) {
          return;
        }
        setCurrentTime(time);
        currentTimeRef.current = time;
        if (time > 0) {
          setShowPoster(false);
          setShowLoading(false);
        }
        onProgress?.(time);
        if (currentPlayUrlRef.current) {
          onPlayUrlChange?.(currentPlayUrlRef.current, time);
        }
      }),
      player.addListener("playToEnd", () => {
        if (!isActiveRef.current) {
          return;
        }
        isPlayingRef.current = false;
        setIsPlaying(false);
        onPlayPause?.(false);
        if (!shouldPauseLocalPlayback()) {
          onDidFinish?.();
        }
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) =>
        callPlayer(() => subscription.remove()),
      );
    };
  }, [
    player,
    onPlayPause,
    onError,
    onProgress,
    onPlayUrlChange,
    onDidFinish,
    shouldPauseLocalPlayback,
    clearStalledTimer,
    sendHeartbeat,
  ]);

  // Resolve what to play: a ready-made source, or a playback session from ott-api.
  const startPlayback = useCallback(
    async (target: DramaEpisode) => {
      const generation = ++openGenerationRef.current;
      const direct = pickDefaultSource(target);
      if (direct) {
        setAvailableSources(target.sources);
        setCurrentQuality(direct.quality);
        setCurrentSource(direct);
        await loadSource(direct.url, startTimeRef.current);
        return;
      }
      if (!target.playback) {
        const message = "No playable source for this episode";
        setErrorFromApi(false);
        setError(message);
        onError?.(message);
        return;
      }
      try {
        const session = await PlaybackService.open(target.playback);
        if (generation !== openGenerationRef.current) {
          // Scrolled away while the session was opening: give the slot back.
          PlaybackService.end(session.id, 0, 0).catch(() => {});
          return;
        }
        sessionRef.current = session;
        heartbeatSequenceRef.current = 0;
        const source: PlaybackSource = {
          quality: "Auto",
          url: session.playlistUrl,
        };
        setAvailableSources([source]);
        setCurrentQuality(source.quality);
        setCurrentSource(source);
        stopHeartbeat();
        heartbeatTimerRef.current = setInterval(
          () => sendHeartbeat(),
          Math.max(5, session.heartbeatSeconds) * 1000,
        );
        await loadSource(source.url, startTimeRef.current || session.resume);
      } catch (e) {
        if (generation !== openGenerationRef.current) {
          return;
        }
        const fromApi = e instanceof ApiError;
        setPinRequired(fromApi && e.type.endsWith("pin-required"));
        const message = e instanceof Error ? e.message : "Playback error";
        console.error("VideoPlayer: failed to open playback session", e);
        setErrorFromApi(fromApi);
        setError(message);
        onError?.(message);
      }
    },
    [loadSource, sendHeartbeat, stopHeartbeat, onError],
  );

  // Load when this item becomes the active one, release when it stops being active.
  useEffect(() => {
    if (!isActive || episode.vip) {
      releaseSource();
      setShowPoster(true);
      setCurrentTime(0);
      setIsPlaying(false);
      setError(null);
      setShowLoading(false);
      return;
    }

    setError(null);
    setErrorFromApi(false);
    setShowPoster(true);
    setShowLoading(true);
    startPlayback(episodeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, episode.vid, episode.vip, retryNonce]);

  // Release on unmount
  useEffect(() => {
    return () => {
      loadGenerationRef.current++;
      openGenerationRef.current++;
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        PlaybackService.end(
          session.id,
          currentTimeRef.current,
          ++heartbeatSequenceRef.current,
        ).catch(() => {});
      }
      if (stalledTimerRef.current) {
        clearTimeout(stalledTimerRef.current);
        stalledTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || !isActive || episode.vip) {
      return;
    }

    const pauseLocalForCast = () => {
      if (!hasSourceRef.current) {
        return;
      }
      if (!androidCastingRef.current) {
        androidCastingRef.current = true;
        androidRemotePositionRef.current = currentTimeRef.current;
      }
      player.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
      onPlayPause?.(false);
    };

    const resumeLocalAfterCast = () => {
      if (!androidCastingRef.current || !hasSourceRef.current) {
        return;
      }

      androidCastingRef.current = false;
      const resumeTime = Math.max(
        remoteCastPosition || 0,
        androidRemotePositionRef.current || 0,
        currentTimeRef.current || 0,
      );

      player.currentTime = resumeTime;
      setCurrentTime(resumeTime);
      player.play();
      isPlayingRef.current = true;
      setIsPlaying(true);
      onPlayPause?.(true);
    };

    if (isRemoteCasting) {
      pauseLocalForCast();
    } else {
      resumeLocalAfterCast();
    }
  }, [
    isRemoteCasting,
    remoteCastPosition,
    isActive,
    episode.vip,
    onPlayPause,
    player,
  ]);

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      !isScreenFocused ||
      !isActive ||
      !currentSource?.url ||
      episode.vip
    ) {
      return;
    }

    AirPlayRelay.configureMedia({
      url: currentSource.url,
      startTime: currentTime,
      title: dramaTitle,
      coverUrl: dramaCoverUrl,
      localWasPlaying: isPlaying,
    }).catch((error) => {
      console.warn("[VideoPlayer] Failed to configure AirPlay media:", error);
    });
  }, [
    isScreenFocused,
    isActive,
    currentSource?.url,
    currentTime,
    isPlaying,
    dramaTitle,
    dramaCoverUrl,
    episode.vip,
  ]);

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      !isScreenFocused ||
      !isActive ||
      episode.vip
    ) {
      return;
    }

    let mounted = true;

    const isStaleAirPlayGeneration = (generation: number) =>
      !mounted || airPlayGenerationRef.current !== generation;

    const applyAirPlaySnapshot = async (snapshot: AirPlaySessionSnapshot) => {
      if (snapshot.generation < airPlayGenerationRef.current) {
        return;
      }

      airPlayGenerationRef.current = snapshot.generation;
      airPlaySessionStateRef.current = snapshot.state;

      if (!hasSourceRef.current) {
        return;
      }

      if (
        snapshot.state === "routeSelecting" ||
        snapshot.state === "routeSelected" ||
        snapshot.state === "starting"
      ) {
        if (!localMutedForAirPlayRef.current) {
          localWasPlayingBeforeAirPlayRef.current = isPlayingRef.current;
          localMutedForAirPlayRef.current = true;
          player.muted = true;
        }
        return;
      }

      if (snapshot.state === "casting") {
        lastAirPlayResumePositionRef.current = snapshot.currentTime;
        if (isPlayingRef.current) {
          player.pause();
          if (isStaleAirPlayGeneration(snapshot.generation)) {
            return;
          }
          isPlayingRef.current = false;
          setIsPlaying(false);
          onPlayPause?.(false);
        }
        return;
      }

      if (snapshot.state === "failed" || snapshot.state === "idle") {
        const shouldRestoreLocal =
          localMutedForAirPlayRef.current ||
          snapshot.shouldResumeLocal ||
          snapshot.state === "failed";
        if (!shouldRestoreLocal) {
          return;
        }

        const resumeTime = Math.max(
          snapshot.currentTime || 0,
          lastAirPlayResumePositionRef.current || 0,
          currentTimeRef.current || 0,
        );

        try {
          await AirPlayRelay.restoreLocalAudioSession();
        } catch (error) {
          console.warn(
            "[VideoPlayer] Failed to restore local AirPlay audio session:",
            error,
          );
        }

        if (isStaleAirPlayGeneration(snapshot.generation)) {
          return;
        }

        player.currentTime = resumeTime;
        setCurrentTime(resumeTime);
        player.muted = false;
        localMutedForAirPlayRef.current = false;
        lastAirPlayResumePositionRef.current = resumeTime;

        if (
          snapshot.shouldResumeLocal &&
          localWasPlayingBeforeAirPlayRef.current &&
          !isPlayingRef.current
        ) {
          player.play();
          if (isStaleAirPlayGeneration(snapshot.generation)) {
            return;
          }
          isPlayingRef.current = true;
          setIsPlaying(true);
          onPlayPause?.(true);
        }

        localWasPlayingBeforeAirPlayRef.current = false;
      }
    };

    const stateSub = AirPlayRelay.addStateListener((snapshot) => {
      applyAirPlaySnapshot(snapshot).catch((error) => {
        console.warn("[VideoPlayer] Failed to apply AirPlay state:", error);
      });
    });

    const progressSub = AirPlayRelay.addProgressListener(
      ({ generation, currentTime }) => {
        if (generation === airPlayGenerationRef.current) {
          lastAirPlayResumePositionRef.current = currentTime;
        }
      },
    );

    AirPlayRelay.getState()
      .then((snapshot) => {
        if (mounted) {
          return applyAirPlaySnapshot(snapshot);
        }
      })
      .catch((error) => {
        console.warn("[VideoPlayer] Failed to get AirPlay state:", error);
      });

    return () => {
      mounted = false;
      stateSub.remove();
      progressSub.remove();
      if (localMutedForAirPlayRef.current) {
        try {
          player.muted = false;
        } catch {
          // player may already be released
        }
      }
      airPlaySessionStateRef.current = "idle";
      localMutedForAirPlayRef.current = false;
      localWasPlayingBeforeAirPlayRef.current = false;
    };
  }, [isScreenFocused, isActive, episode.vip, onPlayPause, player]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (
        nextAppState === "background" &&
        isPlayingRef.current &&
        hasSourceRef.current &&
        isActiveRef.current
      ) {
        callPlayer(() => player.pause());
        isPlayingRef.current = false;
        onPlayPause?.(false);
      } else if (
        nextAppState === "active" &&
        hasSourceRef.current &&
        isScreenFocusedRef.current &&
        isActiveRef.current &&
        !shouldPauseLocalPlayback()
      ) {
        callPlayer(() => player.play());
        isPlayingRef.current = true;
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (
        hasSourceRef.current &&
        isActiveRef.current &&
        !isPlayingRef.current &&
        !shouldPauseLocalPlayback()
      ) {
        callPlayer(() => player.play());
      }

      return () => {
        // On unmount expo-video may already have released the native player.
        if (hasSourceRef.current) {
          callPlayer(() => player.pause());
          isPlayingRef.current = false;
          setIsPlaying(false);
          onPlayPause?.(false);
        }
      };
    }, [player, onPlayPause, shouldPauseLocalPlayback]),
  );

  const handleVideoPress = useCallback(() => {
    if (isPlaying && hasSourceRef.current) {
      player.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else if (
      !isPlaying &&
      hasSourceRef.current &&
      !showPoster &&
      !isRemotePlaybackActive()
    ) {
      player.play();
      isPlayingRef.current = true;
      setIsPlaying(true);
    } else {
      setShowControls(!showControls);
    }
  }, [player, isPlaying, showControls, showPoster, isRemotePlaybackActive]);

  const handlePlayPause = useCallback(() => {
    if (isRemotePlaybackActive() || !hasSourceRef.current) {
      return;
    }
    if (isPlaying) {
      player.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else {
      player.play();
      isPlayingRef.current = true;
      setIsPlaying(true);
    }
  }, [player, isPlaying, isRemotePlaybackActive]);

  const handleRetry = useCallback(() => {
    releaseSource();
    setError(null);
    setErrorFromApi(false);
    setPinRequired(false);
    setShowLoading(false);
    setShowPoster(true);
    setCurrentTime(0);
    setIsPlaying(false);
    setRetryNonce((n) => n + 1);
  }, [releaseSource]);

  const getFullscreenButtonPosition = useCallback(() => {
    if (
      !episode.width ||
      !episode.height ||
      dramaVideoOrientation !== 1 ||
      containerHeight === 0
    ) {
      return { bottom: 20 };
    }

    const containerWidth = screenDimensions.width;
    const actualContainerHeight = containerHeight;

    const videoAspectRatio = episode.width / episode.height;
    const containerAspectRatio = containerWidth / actualContainerHeight;

    let videoRenderHeight, offsetY;

    if (videoAspectRatio > containerAspectRatio) {
      videoRenderHeight = containerWidth / videoAspectRatio;
      offsetY = (actualContainerHeight - videoRenderHeight) / 2;
    } else {
      videoRenderHeight = actualContainerHeight;
      offsetY = 0;
    }

    const buttonBottom = offsetY + videoRenderHeight + 10;

    return {
      top: Math.max(20, buttonBottom),
    };
  }, [
    episode.width,
    episode.height,
    dramaVideoOrientation,
    containerHeight,
    screenDimensions.width,
  ]);

  const handleContainerLayout = useCallback((event: any) => {
    const { height } = event.nativeEvent.layout;
    setContainerHeight(height);
  }, []);

  const handleFullscreenPress = useCallback(async () => {
    try {
      const isPortrait =
        currentOrientation === ScreenOrientation.Orientation.PORTRAIT_UP;

      const goingToFullscreen = isPortrait; // portrait -> landscape means entering fullscreen
      if (isPortrait) {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
        );
      } else {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      }

      onFullscreen?.(goingToFullscreen, currentIndex);
    } catch {
      // Even if locking fails, notify parent with intended state based on current orientation
      const isPortrait =
        currentOrientation === ScreenOrientation.Orientation.PORTRAIT_UP;
      const goingToFullscreen = isPortrait;
      onFullscreen?.(goingToFullscreen, currentIndex);
    }
  }, [onFullscreen, currentOrientation, currentIndex]);

  const handleSeek = useCallback(
    (targetTime: number) => {
      if (
        duration <= 0 ||
        !hasSourceRef.current ||
        !isActive ||
        !isScreenFocused ||
        isRemotePlaybackActive()
      ) {
        return;
      }
      const clampedTime = Math.max(0, Math.min(duration, targetTime));

      player.currentTime = clampedTime;
      setCurrentTime(clampedTime);
      currentTimeRef.current = clampedTime;
      onProgress?.(clampedTime);
    },
    [
      player,
      duration,
      isActive,
      isScreenFocused,
      isRemotePlaybackActive,
      onProgress,
    ],
  );

  const handleLikePress = useCallback(() => {
    const newLikedState = !isLiked;
    const newCount = newLikedState
      ? currentLikeCount + 1
      : Math.max(0, currentLikeCount - 1);

    // Shown at once; the API is told, and the change is taken back if it cannot be saved.
    setIsLiked(newLikedState);
    setCurrentLikeCount(newCount);
    const ref = episode.playback;
    const vid = episode.vid;
    if (ref) {
      setLiked(ref.series, ref.number, newLikedState).catch(() => {
        if (episodeVidRef.current !== vid) return; // moved on: nothing here to take back
        setIsLiked(!newLikedState);
        setCurrentLikeCount(currentLikeCount);
      });
    }
  }, [isLiked, currentLikeCount, episode.playback, episode.vid]);

  const handleLandscapeLikePress = useCallback(() => {
    handleLikePress();
  }, [handleLikePress]);

  const handleCommentPress = useCallback(() => {
    // TODO something
  }, []);

  const handleQualityChange = useCallback(
    async (quality: string, source: PlaybackSource) => {
      if (!hasSourceRef.current || !currentSource) {
        return;
      }
      const resumeAt = currentTimeRef.current;
      setCurrentQuality(quality);
      setCurrentSource(source);
      await loadSource(source.url, resumeAt);
    },
    [currentSource, loadSource],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          flexDirection: "column",
        },
        errorContainer: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
          paddingHorizontal: 32,
        },
        errorText: {
          color: colors.text,
          fontSize: 16,
          textAlign: "center",
          marginBottom: 32,
          lineHeight: 22,
          fontWeight: "400",
        },
        retryButton: {
          backgroundColor: "rgba(255, 255, 255, 0.15)",
          paddingHorizontal: 24,
          paddingVertical: 6,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.2)",
        },
        retryButtonText: {
          color: colors.text,
          fontSize: 16,
          fontWeight: "500",
          marginLeft: 8,
        },
        refreshIcon: {
          width: 18,
          height: 18,
          marginRight: 4,
        },
        videoTouchable: {
          flex: 1,
          position: "relative",
        },
        player: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        },
        coverContainer: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 5,
        },
        coverImage: {
          width: "100%",
          height: "100%",
        },
        coverOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(0, 0, 0, 0.3)",
        },
        bottomProgressBar: {
          position: "absolute",
          bottom: 0,
          left: 16,
          right: 16,
          height: 44,
          justifyContent: "center",
          zIndex: 100,
        },
        landscapeProgressBar: {
          position: "absolute",
          bottom: 40 + insets.bottom,
          left: 16,
          right: 16,
          height: 44,
          justifyContent: "center",
          zIndex: 100,
        },
        touchOverlay: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "transparent",
          zIndex: 1,
        },
      }),
    [insets.bottom],
  );

  if (error && pinRequired) {
    return (
      <View style={styles.errorContainer}>
        <PinPad onVerified={handleRetry} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {errorFromApi
            ? error
            : "Network disconnected, please check and refresh"}
        </Text>
        <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
          <SvgIcon name="refresh" style={styles.refreshIcon} />
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoTouchable} onLayout={handleContainerLayout}>
        {isActive && !episode.vip && (
          <VideoView
            player={player}
            style={styles.player}
            contentFit={dramaVideoOrientation !== 1 ? "cover" : "contain"}
            nativeControls={false}
            allowsPictureInPicture={false}
          />
        )}

        {showPoster && (
          <View style={styles.coverContainer} pointerEvents="none">
            <Image
              source={{ uri: episode.cover_url }}
              contentFit={dramaVideoOrientation === 1 ? "contain" : "cover"}
              style={styles.coverImage}
            />
            <View style={styles.coverOverlay} />
          </View>
        )}

        <TouchableOpacity
          style={styles.touchOverlay}
          onPress={handleVideoPress}
          activeOpacity={1}
          delayPressIn={0}
          delayPressOut={0}
        />

        <PlaybackControls
          currentOrientation={currentOrientation}
          isPlaying={isPlaying}
          showPlayButton={!isPlaying}
          showLoading={showLoading}
          onPlayPause={handlePlayPause}
          onVideoPress={handleVideoPress}
          onFullscreenPress={handleFullscreenPress}
          currentLikeCount={currentLikeCount}
          isLiked={isLiked}
          currentCommentCount={0}
          isCommented={false}
          onLikePress={handleLandscapeLikePress}
          onCommentPress={handleCommentPress}
          playbackSpeed={playbackSpeed}
          onSpeedChange={onSpeedChange}
          sources={availableSources}
          currentQuality={currentQuality}
          onQualityChange={handleQualityChange}
          episodes={episodes}
          currentEpisodeIndex={currentEpisodeIndex || 0}
          dramaTitle={dramaTitle}
          dramaCoverUrl={dramaCoverUrl}
          dramaId={dramaId}
          onEpisodeSelect={onEpisodeSelect}
          fullscreenButtonPosition={getFullscreenButtonPosition()}
          dramaVideoOrientation={dramaVideoOrientation}
          isFeedTab={isFeedTab}
        />

        {!(duration < 60 && dramaVideoOrientation !== 1) && (
          <View
            style={
              currentOrientation === ScreenOrientation.Orientation.PORTRAIT_UP
                ? styles.bottomProgressBar
                : styles.landscapeProgressBar
            }
          >
            <SeekBar
              duration={duration}
              currentTime={currentTime}
              disabled={
                !isActive ||
                !isScreenFocused ||
                isRemotePlaybackActive() ||
                !hasSourceRef.current
              }
              onSeek={handleSeek}
              onSeekingChange={onSeekingChange}
            />
          </View>
        )}
      </View>
    </View>
  );
};

export default VideoPlayer;
