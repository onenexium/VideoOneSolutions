import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMyList, unfollow, type MyListEntry } from "@/services/libraryService";
import { openSeries } from "@/utils/openSeries";

type Sort = "added" | "updated";

export default function MyListScreen() {
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<Sort>("added");
  const [entries, setEntries] = useState<MyListEntry[]>([]);
  const [count, setCount] = useState<{ count: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setError(null);
    try {
      const page = await getMyList(sort);
      if (generation !== generationRef.current) return;
      cursorRef.current = page.nextCursor;
      setEntries(page.items);
      setCount({ count: page.count, limit: page.limit });
    } catch (err) {
      if (generation === generationRef.current) setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [sort]);

  // Coming back from a series page where it was followed or unfollowed: show the truth.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => setLoading(true), [sort]);

  const loadMore = async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const generation = generationRef.current;
    try {
      const page = await getMyList(sort, cursor);
      if (generation !== generationRef.current) return;
      cursorRef.current = page.nextCursor;
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.shortId));
        return [...prev, ...page.items.filter((e) => !seen.has(e.shortId))];
      });
    } catch {
      // The next time the end is reached tries again.
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const remove = async (entry: MyListEntry) => {
    setEntries((prev) => prev.filter((e) => e.shortId !== entry.shortId));
    try {
      await unfollow(entry.shortId);
      setCount((c) => (c ? { ...c, count: Math.max(0, c.count - 1) } : c));
    } catch {
      void load(); // it did not go through: show the list as the server has it
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My List</Text>
        <TouchableOpacity onPress={() => router.push("/history" as any)} accessibilityRole="button">
          <Text style={styles.count}>History</Text>
        </TouchableOpacity>
        {count && (
          <Text style={styles.count}>
            {count.count} / {count.limit}
          </Text>
        )}
      </View>
      <View style={styles.sorts}>
        {(["added", "updated"] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.sort, sort === value && styles.sortActive]}
            onPress={() => setSort(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === value }}
          >
            <Text style={styles.sortText}>{value === "added" ? "Recently added" : "Recently updated"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#FFFFFF" />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.message}>Error: {error}</Text>
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.message}>Series you follow will be here.</Text>
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
                  accessibilityLabel={item.title}
                >
                  <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.availability === "removed" && <Text style={styles.note}>No longer available</Text>}
                    {item.availability === "not-here" && <Text style={styles.note}>Not available where you are</Text>}
                    {available && item.newEpisodes && <Text style={styles.badge}>New episodes</Text>}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => remove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title}`}
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
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: "#FFFFFF", fontSize: 32 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flex: 1 },
  count: { color: "#B3B3B3", fontSize: 13 },
  sorts: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  sort: { backgroundColor: "#1A1A1A", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  sortActive: { backgroundColor: "#3A3A3A" },
  sortText: { color: "#FFFFFF", fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  message: { color: "#FFFFFF", fontSize: 14 },
  retry: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: "#333333" },
  retryText: { color: "#FFFFFF" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  unavailable: { opacity: 0.45 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  poster: { width: 60, height: 90, borderRadius: 6, backgroundColor: "#1A1A1A" },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  note: { color: "#B3B3B3", fontSize: 12 },
  badge: { color: "#5BD98A", fontSize: 12, fontWeight: "600" },
  remove: { color: "#FF6B6B", fontSize: 13 },
});
