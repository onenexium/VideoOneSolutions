import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DramaCover from "@/components/drama/DramaCover";
import { ApiError } from "@/services/api";
import {
  follow,
  getSeriesDetail,
  getSimilar,
  unfollow,
  type SeriesDetail,
} from "@/services/libraryService";
import { createShare } from "@/services/supportService";
import { setAutoUnlock } from "@/services/walletService";
import type { DramaChannelMeta } from "@/types/drama";
import { openSeries } from "@/utils/openSeries";

export default function SeriesScreen() {
  const { shortId } = useLocalSearchParams<{ shortId: string }>();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [similar, setSimilar] = useState<DramaChannelMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [autoUnlock, setAutoUnlockState] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setDetail(null);
    try {
      const result = await getSeriesDetail(shortId);
      setDetail(result);
      setFollowing(result.following);
      setAutoUnlockState(result.mine?.autoUnlock ?? false);
      getSimilar(shortId).then(setSimilar).catch(() => setSimilar([]));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This series is not available."
          : err instanceof ApiError && err.status === 410
            ? "This series is no longer available."
            : err instanceof Error
              ? err.message
              : "Failed to load",
      );
    }
  }, [shortId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async () => {
    if (followBusy) return;
    const next = !following;
    setFollowing(next); // show it at once; undo below if the server says no
    setFollowBusy(true);
    try {
      await (next ? follow(shortId) : unfollow(shortId));
    } catch (err) {
      setFollowing(!next);
      const full = err instanceof ApiError && err.type.endsWith("list-full");
      Alert.alert(full ? "Your list is full" : "Could not update", full ? "Remove some to add more." : "Please try again.");
    } finally {
      setFollowBusy(false);
    }
  };

  // The phone's share sheet with the link the API made for this share (a code per share; BE-72).
  const share = async () => {
    try {
      const made = await createShare({ series: shortId });
      const title = detail?.series.title ?? "";
      const url = made.url ?? "";
      await Share.share({ message: url ? `Watch ${title}: ${url}` : `Watch ${title}`, url: url || undefined });
    } catch {
      Alert.alert("Could not share", "Please try again.");
    }
  };

  const play = (episode: number) => {
    if (!detail) return;
    router.push({
      pathname: "/drama_player",
      params: {
        dramaId: detail.series.shortId,
        dramaTitle: detail.series.title,
        dramaCoverUrl: detail.series.artwork.poster?.url ?? "",
        episodeOrder: String(episode),
        dramaVideoOrientation: "0",
      },
    } as any);
  };

  const header = (
    <TouchableOpacity
      onPress={() => router.back()}
      style={[styles.back, { top: insets.top + 8 }]}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Text style={styles.backText}>‹</Text>
    </TouchableOpacity>
  );

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        {header}
        <Text style={styles.message}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!detail) {
    return (
      <View style={[styles.container, styles.center]}>
        {header}
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  const { series, episodes, watched } = detail;
  const art = series.artwork.banner ?? series.artwork.cover ?? series.artwork.poster;
  const firstUnwatched = episodes.find((e) => !watched.includes(e.order))?.order ?? 1;
  const freeLine =
    series.freeEpisodes > 0 ? `Episodes 1–${series.freeEpisodes} free` : null;

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {art && <Image source={{ uri: art.url }} style={styles.art} contentFit="cover" />}
        <View style={styles.body}>
          <Text style={styles.title}>{series.title}</Text>
          <Text style={styles.meta}>
            {[series.rating, series.releaseState === "ongoing" ? "Ongoing" : "Completed", series.year, `${episodes.length} episodes`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {series.advisory ? <Text style={styles.advisory}>{series.advisory}</Text> : null}
          {freeLine && <Text style={styles.free}>{freeLine}</Text>}
          {series.scheduleText ? <Text style={styles.meta}>{series.scheduleText}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.watch} onPress={() => play(firstUnwatched)} accessibilityRole="button">
              <Text style={styles.watchText}>{watched.length > 0 ? `Continue · Ep ${firstUnwatched}` : "Watch now"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.follow, following && styles.following]}
              onPress={toggleFollow}
              accessibilityRole="button"
              accessibilityState={{ selected: following }}
              accessibilityLabel={following ? "Remove from My List" : "Add to My List"}
            >
              <Text style={styles.followText}>{following ? "✓ In My List" : "+ My List"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.follow} onPress={share} accessibilityRole="button" accessibilityLabel="Share">
              <Text style={styles.followText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.follow}
              onPress={() => router.push({ pathname: "/report", params: { shortId } } as any)}
              accessibilityRole="button"
              accessibilityLabel="Report a problem with this series"
            >
              <Text style={styles.followText}>Report</Text>
            </TouchableOpacity>
          </View>

          {episodes.some((e) => e.vip) && detail.mine && (
            <View style={styles.autoRow}>
              <Text style={styles.autoText}>Unlock the next episodes automatically</Text>
              <Switch
                value={autoUnlock}
                onValueChange={(on) => {
                  setAutoUnlockState(on);
                  setAutoUnlock(shortId, on).catch(() => {
                    setAutoUnlockState(!on);
                    Alert.alert("Could not update", "Log in and try again.");
                  });
                }}
                accessibilityLabel="Unlock the next episodes automatically"
              />
            </View>
          )}

          <Text style={styles.synopsis}>{series.synopsis}</Text>

          {series.tags.length > 0 && (
            <View style={styles.tags}>
              {series.tags.map((tag) => (
                <View key={tag.slug} style={styles.tag}>
                  <Text style={styles.tagText}>{tag.names.en ?? tag.slug}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.section}>Episodes</Text>
          <View style={styles.grid}>
            {episodes.map((episode) => {
              const locked = episode.vip;
              return (
                <TouchableOpacity
                  key={episode.vid}
                  style={[styles.cell, watched.includes(episode.order) && styles.cellWatched]}
                  accessibilityRole="button"
                  accessibilityLabel={`Episode ${episode.order}${locked ? ", locked" : ""}`}
                  onPress={() => play(episode.order)} // a locked one opens its unlock sheet in the player
                >
                  <Text style={styles.cellText}>{episode.order}</Text>
                  {locked && <Text style={styles.lock}>🔒</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {similar.length > 0 && (
            <>
              <Text style={styles.section}>More like this</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similar}>
                {similar.map((drama) => (
                  <DramaCover
                    key={drama.dramaId}
                    drama={drama}
                    onPress={openSeries}
                    width={100}
                    height={181}
                    showPlayCount={false}
                    showNewBadge={true}
                    showRank={false}
                    type="new"
                  />
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center" },
  back: { position: "absolute", left: 12, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  backText: { color: "#FFFFFF", fontSize: 28, marginTop: -3 },
  art: { width: "100%", aspectRatio: 16 / 11 },
  body: { padding: 16, gap: 10 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  meta: { color: "#B3B3B3", fontSize: 13 },
  advisory: { color: "#E5A00D", fontSize: 13 },
  free: { color: "#5BD98A", fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 12, marginVertical: 6 },
  watch: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  watchText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  follow: { paddingHorizontal: 16, backgroundColor: "#1A1A1A", borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  following: { backgroundColor: "#2A3A2F" },
  followText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  synopsis: { color: "#DDDDDD", fontSize: 14, lineHeight: 20 },
  autoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  autoText: { color: "#DDDDDD", fontSize: 13, flex: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: "#1A1A1A", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { color: "#CCCCCC", fontSize: 12 },
  section: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" },
  cellWatched: { opacity: 0.5 },
  cellText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  lock: { position: "absolute", top: 2, right: 3, fontSize: 10 },
  similar: { gap: 12 },
  message: { color: "#FFFFFF", fontSize: 14 },
  retry: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: "#333333" },
  retryText: { color: "#FFFFFF" },
});
