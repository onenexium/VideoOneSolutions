import SvgIcon from "@/components/ui/SvgIcon";
import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import {
  CommonActions,
  useNavigation,
  type NavigationAction,
} from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import { DramaService } from "@/services/dramaService";
import { autoUnlocked, locked, opened, type AutoUnlockedEvent } from "@/services/playbackEvents";
import { PlaybackService } from "@/services/playbackService";
import { undoUnlock } from "@/services/walletService";
import UnlockSheet from "@/components/player/UnlockSheet";
import { DramaEpisode } from "@/types/drama";
import {
  EpisodePlayer,
  EpisodeSelectorModal,
} from "../components";
import CastActiveOverlay from "../components/cast/CastActiveOverlay";
import { useCast } from "../hooks/useCast";
import { useSeekGestureLock } from "../hooks/useSeekGestureLock";
import { AirPlayRelay } from "../components/cast/AirPlayRelay";
import {
  createCastExitGuard,
  type CastExitGuard,
} from "../utils/castExitGuard.mjs";

// Get screen dimensions, swap width and height in landscape mode
const getScreenDimensions = () => {
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  return { width: screenWidth, height: screenHeight };
};

export default function DramaPlayer() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const castController = useCast();
  const pendingAirPlayExitRef = useRef<NavigationAction | null>(null);
  const airPlayRequiresRouteSelectionRef = useRef(false);
  const [airPlayRequiresRouteSelection, setAirPlayRequiresRouteSelection] =
    useState(false);
  const { isSeeking, onSeekingChange } = useSeekGestureLock(airPlayRequiresRouteSelection);
  const isRemotePlaybackActive = Boolean(
    castController.isCasting || castController.isConnected
  );
  const castExitGuardRef = useRef<CastExitGuard | null>(null);
  if (castExitGuardRef.current === null) {
    castExitGuardRef.current = createCastExitGuard();
  }
  useLayoutEffect(() => {
    castExitGuardRef.current!.update(
      isRemotePlaybackActive,
      castController.stopCasting
    );
  }, [isRemotePlaybackActive, castController.stopCasting]);
  const stopCastingForExit = useCallback(
    () => castExitGuardRef.current!.stopForExit(),
    []
  );
  const [loading, setLoading] = useState(true);
  const [episodes, setEpisodes] = useState<DramaEpisode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  // Modal state management
  const [showEpisodeSelector, setShowEpisodeSelector] = useState(false);

  const handleAirPlayExitIntent = useCallback(() => {
    pendingAirPlayExitRef.current = CommonActions.goBack();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    const applyAirPlayState = (snapshot: {
      state: string;
      routeActive: boolean;
    }) => {
      const isLocalRoute =
        snapshot.state === "idle" && !snapshot.routeActive;
      airPlayRequiresRouteSelectionRef.current = !isLocalRoute;
      setAirPlayRequiresRouteSelection(!isLocalRoute);

      if (!isLocalRoute) {
        return;
      }

      const pendingAction = pendingAirPlayExitRef.current;
      if (!pendingAction) {
        return;
      }

      pendingAirPlayExitRef.current = null;
      navigation.dispatch(pendingAction);
    };

    const stateSub = AirPlayRelay.addStateListener(applyAirPlayState);
    AirPlayRelay.getState()
      .then(applyAirPlayState)
      .catch((error) => {
        console.warn("[DramaPlayer] Failed to read AirPlay state:", error);
      });

    return () => stateSub.remove();
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: any) => {
      if (Platform.OS === "ios" && airPlayRequiresRouteSelectionRef.current) {
        event.preventDefault();
        pendingAirPlayExitRef.current = event.data.action;
        return;
      }

      if (Platform.OS === "android") {
        stopCastingForExit();
      }
    });
    return unsubscribe;
  }, [navigation, stopCastingForExit]);

  useEffect(() => {
    if (isRemotePlaybackActive) {
      setShowEpisodeSelector(false);
    }
  }, [isRemotePlaybackActive]);

  // Screen orientation state
  const [isLandscape, setIsLandscape] = useState(false);
  const [isTransitioningOrientation, setIsTransitioningOrientation] =
    useState(false);
  const suppressViewabilityRef = useRef(false);
  // Screen dimensions state
  const [screenDimensions, setScreenDimensions] = useState(
    getScreenDimensions()
  );

  const flashListRef = useRef<any>(null);

  // Parse route parameters
  const dramaId = params.dramaId as string;
  const dramaTitle =
    episodes[currentIndex]?.caption || (params.dramaTitle as string);
  const dramaCoverUrl = params.dramaCoverUrl as string;
  const dramaVideoOrientation =
    parseInt(params.dramaVideoOrientation as string) || 0;
  const episodeOrder = params.episodeOrder
    ? parseInt(params.episodeOrder as string)
    : 1;
  const startTime = parseInt(params.startTime as string) || 0;

  useEffect(() => {
    if (episodeOrder !== undefined) {
      setCurrentIndex(episodeOrder - 1);
    }
  }, [episodeOrder]);

  // ---- coins: unlocking, and the notice for an automatic unlock ----
  const [autoNotice, setAutoNotice] = useState<AutoUnlockedEvent | null>(null);

  const setLocked = useCallback((numbers: number[], isLocked: boolean) => {
    setEpisodes((prev) =>
      prev.map((e) => (numbers.includes(e.order) ? { ...e, vip: isLocked } : e)),
    );
  }, []);

  useEffect(
    () =>
      autoUnlocked.subscribe((event) => {
        if (event.series !== dramaId) return;
        setAutoNotice(event);
        setLocked([event.episode], false);
      }),
    [dramaId, setLocked],
  );
  // The API says an episode must be unlocked (e.g. auto-unlock could not pay): lock it, which shows the sheet.
  useEffect(
    () =>
      locked.subscribe((event) => {
        if (event.series === dramaId) setLocked([event.episode], true);
      }),
    [dramaId, setLocked],
  );
  useEffect(() => {
    if (!autoNotice) return;
    const timer = setTimeout(() => setAutoNotice(null), 10_000);
    return () => clearTimeout(timer);
  }, [autoNotice]);

  const undoAutoUnlock = useCallback(async () => {
    const notice = autoNotice;
    setAutoNotice(null);
    if (!notice) return;
    try {
      await undoUnlock(notice.unlockId);
      setLocked([notice.episode], true); // locked again: playback stops and the sheet shows
    } catch {
      Alert.alert("Could not undo", "It is too late to undo this unlock.");
    }
  }, [autoNotice, setLocked]);

  // The rating card: for a few seconds when a series that is not for everyone starts playing, once
  // per series each time the player is opened.
  const [ratingCard, setRatingCard] = useState<string | null>(null);
  const ratedRef = useRef(new Set<string>());
  useEffect(
    () =>
      opened.subscribe((event) => {
        if (event.series !== dramaId || event.rating === "U" || ratedRef.current.has(event.series)) return;
        ratedRef.current.add(event.series);
        setRatingCard(event.rating.replace("UA", "U/A ") + (event.rating === "A" ? " · Adults only" : "+"));
      }),
    [dramaId],
  );
  useEffect(() => {
    if (!ratingCard) return;
    const timer = setTimeout(() => setRatingCard(null), 4000);
    return () => clearTimeout(timer);
  }, [ratingCard]);

  // Prepare the next episode's session once the current one has had a moment to start, so the swipe
  // only has to start it. A locked next episode is left alone (nothing to prepare until unlocked).
  useEffect(() => {
    const next = episodes[currentIndex + 1];
    const ref = next?.playback;
    if (!ref || next.vip) return;
    const timer = setTimeout(() => PlaybackService.prefetch(ref), 3000);
    return () => clearTimeout(timer);
  }, [episodes, currentIndex]);

  // Get episode data
  const fetchEpisodes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const episodesData = await DramaService.getDramaList({
        drama_id: dramaId,
      });

      setEpisodes(episodesData);

      // If episode number is specified, jump to corresponding episode
      if (episodeOrder !== undefined) {
        const targetIndex = episodesData.findIndex(
          (ep) => ep.order === episodeOrder
        );
        if (targetIndex !== -1) {
          setCurrentIndex(targetIndex);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch episodes:", err);
      setError(err instanceof Error ? err.message : "Failed to load episodes");
      setLoading(false);
    }
  }, [dramaId, episodeOrder]);

  // Return to previous route
  const handleBackPress = useCallback(async () => {
    if (isLandscape) {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
      return;
    }

    if (Platform.OS === "ios" && airPlayRequiresRouteSelectionRef.current) {
      handleAirPlayExitIntent();
      return;
    }

    await stopCastingForExit();
    router.back();
  }, [isLandscape, handleAirPlayExitIntent, stopCastingForExit]);

  // Initialize data
  useEffect(() => {
    fetchEpisodes();
  }, [fetchEpisodes]);

  // Listen to screen orientation changes
  useEffect(() => {
    const initializeOrientation = async () => {
      try {
        const orientation = await ScreenOrientation.getOrientationAsync();
        const isCurrentlyLandscape =
          orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
        setIsLandscape(isCurrentlyLandscape);
      } catch (error) {
        console.error("Failed to get initial orientation:", error);
      }
    };

    initializeOrientation();

    const subscription = ScreenOrientation.addOrientationChangeListener(
      (event) => {
        const newOrientation = event.orientationInfo.orientation;
        const isCurrentlyLandscape =
          newOrientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          newOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
        setIsLandscape(isCurrentlyLandscape);
        // Freeze index during orientation transition to avoid viewability re-pick
        suppressViewabilityRef.current = true;
        setIsTransitioningOrientation(true);
        // Update screen dimensions, then re-align to current index after a short delay
        setScreenDimensions(getScreenDimensions());
        setTimeout(() => {
          if (flashListRef.current) {
            const targetOffset = screenDimensions.height * currentIndex;
            flashListRef.current.scrollToOffset({
              offset: targetOffset,
              animated: false,
            });
          }
          suppressViewabilityRef.current = false;
          setIsTransitioningOrientation(false);
        }, 400);
      }
    );

    return () => {
      subscription.remove();
    };
  }, [currentIndex, screenDimensions.height]);

  // Handle playback state change
  const handlePlayPause = useCallback((playing: boolean) => {
    // Playback state change handling, now managed internally by VideoPlayer
  }, []);

  // Handle episode switching
  const handleEpisodeChange = useCallback(
    (index: number, animated?: boolean) => {
      setCurrentIndex(index);
      if (flashListRef.current) {
        const isNear = Math.abs(index - currentIndex) <= 1;
        flashListRef.current.scrollToIndex({ index, animated: isNear });
      }
    },
    [currentIndex]
  );

  // Handle video finish - auto switch to next episode
  const handleVideoFinish = useCallback(() => {
    if (isRemotePlaybackActive) {
      return;
    }

    if (currentIndex < episodes.length - 1) {
      // Switch to next episode
      const nextIndex = currentIndex + 1;
      handleEpisodeChange(nextIndex, true);
    }
  }, [
    currentIndex,
    episodes.length,
    handleEpisodeChange,
    isRemotePlaybackActive,
  ]);

  // Handle episode selector modal
  const handleEpisodeSelectorPress = useCallback(() => {
    setShowEpisodeSelector(true);
  }, []);

  // Handle episode selection
  const handleEpisodeSelect = useCallback(
    (index: number) => {
      if (index !== currentIndex) {
        handleEpisodeChange(index);
      }
      setShowEpisodeSelector(false);
    },
    [currentIndex, handleEpisodeChange]
  );

  // Create viewability config callback pairs once per mounted list, including Fast Refresh.
  const viewabilityConfigCallbackPairs = useRef(
    [
      {
        viewabilityConfig: {
          itemVisiblePercentThreshold: 50,
          minimumViewTime: 300,
          waitForInteraction: false,
        },
        onViewableItemsChanged: ({ viewableItems }: any) => {
          if (suppressViewabilityRef.current) return;
          if (viewableItems.length > 0) {
            const newIndex = viewableItems[0].index;
            setCurrentIndex((prevIndex) => {
              if (newIndex !== prevIndex) {
                return newIndex;
              }
              return prevIndex;
            });
          }
        },
      },
    ]
  ).current;

  const handleFullscreenFreeze = useCallback(
    (isFullscreen?: boolean, index?: number) => {
      // Keep the list anchored on the current (or provided) index during fullscreen transitions
      const targetIndex = index ?? currentIndex;
      suppressViewabilityRef.current = true;
      // Short delay to wait for orientation lock to settle when exiting fullscreen
      const delay = isFullscreen ? 0 : 300;
      setTimeout(() => {
        if (flashListRef.current) {
          try {
            flashListRef.current.scrollToIndex({
              index: targetIndex,
              animated: false,
            });
          } catch {}
        }
        suppressViewabilityRef.current = false;
      }, delay);
    },
    [currentIndex]
  );

  // Ensure at most one item moves per gesture and snap to start
  const handleMomentumScrollEnd = useCallback(
    (event: any) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const itemHeight = screenDimensions.height;
      const intendedIndex = Math.round(offsetY / itemHeight);
      const minIndex = Math.max(0, currentIndex - 1);
      const maxIndex = Math.min(episodes.length - 1, currentIndex + 1);
      const clampedIndex = Math.max(
        minIndex,
        Math.min(maxIndex, intendedIndex)
      );

      if (clampedIndex !== intendedIndex) {
        // Snap to the nearest allowed index (at most one away)
        if (flashListRef.current) {
          flashListRef.current.scrollToIndex({
            index: clampedIndex,
            animated: true,
          });
        }
      }
    },
    [currentIndex, episodes.length, screenDimensions.height]
  );

  // Create dynamic styles
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: "#000",
          position: "relative",
        },
        titleBar: {
          position: "absolute",
          left: 10,
          right: 20,
          zIndex: 1000,
          flexDirection: "row",
          alignItems: "center",
        },
        backButton: {
          padding: 8,
          marginRight: 12,
        },
        backIcon: {
          width: 20,
          height: 20,
          tintColor: "#fff",
        },
        titleText: {
          color: "#fff",
          fontSize: 18,
          fontWeight: "bold",
          flex: 1, // Take remaining space
        },
        loadingContainer: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#000",
        },
        loadingText: {
          marginTop: 12,
          color: "#fff",
          fontSize: 16,
        },
        errorText: {
          color: "#ff4444",
          fontSize: 16,
          textAlign: "center",
          marginBottom: 20,
        },
        retryButton: {
          backgroundColor: "#1664FF",
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderRadius: 8,
        },
        retryButtonText: {
          color: "#fff",
          fontSize: 16,
          fontWeight: "bold",
        },
        videoItem: {
          width: screenDimensions.width,
          height: screenDimensions.height,
        },
      }),
    [screenDimensions.width, screenDimensions.height]
  );

  // Render single video item
  const renderVideoItem = useCallback(
    ({ item, index }: { item: DramaEpisode; index: number }) => {
      // Only render items within 2 positions of currentIndex
      if (Math.abs(index - currentIndex) >= 2) {
        // Render empty view for items far from current
        return <View style={[styles.videoItem]} />;
      }
      return (
        <View style={[styles.videoItem]}>
          <EpisodePlayer
            castController={castController}
            episode={item}
            dramaTitle={dramaTitle}
            dramaCoverUrl={dramaCoverUrl}
            startTime={
              episodeOrder && index === episodeOrder - 1 ? startTime : 0
            }
            episodes={episodes}
            currentEpisodeIndex={currentIndex}
            playerIndex={index}
            onPlayPause={handlePlayPause}
            onSeekingChange={onSeekingChange}
            onEpisodeSelectorPress={handleEpisodeSelectorPress}
            onRecommendationPress={() => {}}
            dramaId={dramaId}
            playbackSpeed={playbackSpeed}
            onSpeedChange={setPlaybackSpeed}
            dramaVideoOrientation={dramaVideoOrientation}
            onEpisodeSelect={handleEpisodeSelect}
            onFullscreen={handleFullscreenFreeze}
            onDidFinish={handleVideoFinish}
            onError={(error) => {
              console.error(`Episode ${index} error:`, error);
            }}
          />
        </View>
      );
    },
    [
      currentIndex,
      styles.videoItem,
      dramaTitle,
      dramaCoverUrl,
      episodeOrder,
      startTime,
      episodes,
      handlePlayPause,
      onSeekingChange,
      handleEpisodeSelectorPress,
      dramaId,
      playbackSpeed,
      dramaVideoOrientation,
      handleEpisodeSelect,
      handleFullscreenFreeze,
      handleVideoFinish,
      castController,
    ]
  );

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <ActivityIndicator size="large" color="#1664FF" />
        <Text style={styles.loadingText}>Loading episodes...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity onPress={fetchEpisodes} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isRemotePlaybackActive && (
        <View style={[styles.titleBar, { top: insets.top }]}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
            <SvgIcon
              name="chevron-left"
              style={styles.backIcon}
            />
          </TouchableOpacity>
          <Text style={styles.titleText} numberOfLines={1}>
            {dramaTitle}
          </Text>
        </View>
      )}

      <FlatList
        ref={flashListRef}
        data={episodes}
        renderItem={renderVideoItem}
        initialScrollIndex={episodeOrder - 1}
        keyExtractor={(item: DramaEpisode) => item.vid}
        extraData={{ currentIndex, episodes }}
        getItemLayout={(data, index) => ({
          length: screenDimensions.height,
          offset: screenDimensions.height * index,
          index,
        })}
        snapToInterval={screenDimensions.height}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        bounces={false}
        overScrollMode="never"
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        pagingEnabled={!isTransitioningOrientation}
        removeClippedSubviews={!isTransitioningOrientation}
        scrollEnabled={!isLandscape && !isRemotePlaybackActive && !isSeeking}
        scrollEventThrottle={16}
      />

      {/* Locked episode: unlock with coins */}
      {!isRemotePlaybackActive && episodes[currentIndex]?.vip && episodes[currentIndex]?.playback && (
        <UnlockSheet
          key={episodes[currentIndex].vid}
          series={dramaId}
          episode={episodes[currentIndex].order}
          coins={episodes[currentIndex].coins ?? 0}
          onUnlocked={(numbers) => setLocked(numbers, false)}
          onDismiss={() => router.back()}
        />
      )}

      {ratingCard && (
        <View style={[autoToastStyles.rating, { top: insets.top + 56 }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={autoToastStyles.ratingText}>{ratingCard}</Text>
        </View>
      )}

      {/* Automatic unlock: what was charged, with Undo for a few seconds */}
      {autoNotice && (
        <View style={[autoToastStyles.toast, { bottom: insets.bottom + 72 }]}>
          <Text style={autoToastStyles.text}>
            Episode {autoNotice.episode} unlocked, {autoNotice.coins} coins.
          </Text>
          <TouchableOpacity onPress={undoAutoUnlock} accessibilityRole="button">
            <Text style={autoToastStyles.undo}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Episode Selector Modal */}
      <EpisodeSelectorModal
        episodes={episodes}
        currentEpisodeIndex={currentIndex}
        onEpisodeSelect={handleEpisodeSelect}
        visible={!isRemotePlaybackActive && showEpisodeSelector}
        onClose={() => setShowEpisodeSelector(false)}
        dramaTitle={dramaTitle}
        dramaCoverUrl={dramaCoverUrl}
        dramaId={dramaId}
      />

      {isRemotePlaybackActive && (
        <CastActiveOverlay
          deviceName={castController.deviceName}
          remotePosition={castController.remotePosition}
          onStop={castController.stopCasting}
        />
      )}
    </View>
  );
}

const autoToastStyles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 600,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#262626",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rating: { position: "absolute", left: 16, zIndex: 550, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#FFFFFF" },
  ratingText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  text: { color: "#FFFFFF", fontSize: 14, flex: 1 },
  undo: { color: "#7DB2FF", fontSize: 14, fontWeight: "700", paddingLeft: 16 },
});
