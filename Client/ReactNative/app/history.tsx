import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clearHistory,
  getHistory,
  getHistoryPaused,
  removeFromHistory,
  setHistoryPaused,
  type HistoryEntry,
} from "@/services/historyService";
import { openSeries } from "@/utils/openSeries";
import { colors } from "@/constants/theme";

/**
 * History (deep dive 5, F2): what was watched, last first, with where the viewer is. Remove one, clear
 * all, or pause: while paused nothing watched is added here or used for rankings, and resuming still
 * works. Clearing keeps coins, unlocks, My List and likes.
 */
export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [page, isPaused] = await Promise.all([getHistory(), getHistoryPaused()]);
      cursorRef.current = page.nextCursor;
      setEntries(page.items);
      setPaused(isPaused);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loadMore = async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const page = await getHistory(cursor);
      cursorRef.current = page.nextCursor;
      setEntries((prev) => {
        const seen = new Set((prev ?? []).map((e) => e.shortId));
        return [...(prev ?? []), ...page.items.filter((e) => !seen.has(e.shortId))];
      });
    } catch {
      // the next time the end is reached tries again
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const togglePause = async (on: boolean) => {
    setPaused(on);
    try {
      setPaused(await setHistoryPaused(on));
    } catch {
      setPaused(!on);
      Alert.alert("Could not change it", "Please try again.");
    }
  };

  const remove = (entry: HistoryEntry) => {
    setEntries((prev) => prev?.filter((e) => e.shortId !== entry.shortId) ?? prev);
    removeFromHistory(entry.shortId).catch(() => void load());
  };

  const clearAll = () =>
    Alert.alert(
      "Clear all history?",
      "Your watch progress goes. Coins, unlocks, My List and likes stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setEntries([]);
            clearHistory().catch(() => void load());
          },
        },
      ],
    );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        {entries && entries.length > 0 && (
          <TouchableOpacity onPress={clearAll} accessibilityRole="button">
            <Text style={styles.clear}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.pauseRow}>
        <View style={styles.flex}>
          <Text style={styles.text}>Pause history</Text>
          <Text style={styles.note}>
            While paused, what you watch isn&apos;t added to History, recommendations or rankings. You can still resume an episode you&apos;re watching.
          </Text>
        </View>
        <Switch value={paused} onValueChange={togglePause} accessibilityLabel="Pause history" />
      </View>
      {paused && <Text style={styles.banner}>History is paused</Text>}

      {error ? (
        <View style={styles.center}>
          <Text style={styles.text}>Error: {error}</Text>
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.text}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : entries === null ? (
        <ActivityIndicator style={styles.center} color={colors.text} />
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.text}>What you watch will be here.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.shortId}
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => {
            const available = item.availability === "available" && item.meta;
            return (
              <View style={[styles.row, !available && styles.unavailable]}>
                <TouchableOpacity
                  style={styles.rowMain}
                  disabled={!available}
                  onPress={() => item.meta && openSeries(item.meta)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, episode ${item.episode}`}
                >
                  <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.note}>
                      Episode {item.episode}
                      {item.watched ? " · watched" : ""}
                    </Text>
                    {item.availability === "removed" && <Text style={styles.note}>No longer available</Text>}
                    {item.availability === "not-here" && <Text style={styles.note}>Not available where you are</Text>}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => remove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title} from History`}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.remove}>Remove</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: colors.text, fontSize: 32 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", flex: 1 },
  clear: { color: colors.danger, fontSize: 14 },
  pauseRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  banner: { color: colors.gold, fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  retry: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surfaceHigh },
  text: { color: colors.text, fontSize: 14 },
  note: { color: colors.textMuted, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  unavailable: { opacity: 0.45 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  poster: { width: 60, height: 90, borderRadius: 6, backgroundColor: colors.surface },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  remove: { color: colors.danger, fontSize: 13 },
});
