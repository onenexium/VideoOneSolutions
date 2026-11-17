import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { USE_MOCK_API } from "@/services/api";
import { getContinueWatching, hideFromContinue, type ContinueEntry } from "@/services/historyService";

/**
 * Continue watching on Home (deep dive 5, F3): the series being watched, last watched first, each at
 * the episode to play next. Read again every time Home is shown; hidden when there is nothing.
 * Long press takes a series off (it comes back when played again).
 */
const ContinueWatchingRail: React.FC = () => {
  const [items, setItems] = useState<ContinueEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (USE_MOCK_API) return;
      let live = true;
      getContinueWatching()
        .then((next) => live && setItems(next))
        .catch(() => undefined); // the rest of Home works without it
      return () => {
        live = false;
      };
    }, []),
  );

  if (items.length === 0) return null;

  const play = (item: ContinueEntry) =>
    router.push({
      pathname: "/drama_player",
      params: {
        dramaId: item.meta.dramaId,
        dramaTitle: item.meta.dramaTitle,
        dramaCoverUrl: item.meta.dramaCoverUrl,
        episodeOrder: String(item.episode),
        startTime: String(item.position),
        dramaVideoOrientation: "0",
      },
    } as any);

  const remove = (item: ContinueEntry) =>
    Alert.alert("Remove from Continue watching?", item.meta.dramaTitle, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setItems((prev) => prev.filter((i) => i.meta.dramaId !== item.meta.dramaId));
          hideFromContinue(item.meta.dramaId).catch(() => undefined);
        },
      },
    ]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Continue watching</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item) => {
          const share = item.duration ? Math.min(1, item.position / item.duration) : 0;
          return (
            <TouchableOpacity
              key={item.meta.dramaId}
              style={styles.card}
              onPress={() => play(item)}
              onLongPress={() => remove(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.meta.dramaTitle}, episode ${item.episode}`}
              accessibilityHint="Long press to remove from Continue watching"
            >
              <Image source={{ uri: item.meta.dramaCoverUrl }} style={styles.poster} contentFit="cover" />
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round(share * 100)}%` }]} />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {item.meta.dramaTitle}
              </Text>
              <Text style={styles.episode}>{item.newEpisode ? `New: Ep ${item.episode}` : `Ep ${item.episode}`}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 32 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", paddingHorizontal: 16, marginBottom: 12 },
  row: { paddingHorizontal: 16, gap: 12 },
  card: { width: 110 },
  poster: { width: 110, height: 160, borderRadius: 8, backgroundColor: "#1A1A1A" },
  bar: { height: 3, backgroundColor: "#333333", borderRadius: 2, marginTop: 4 },
  barFill: { height: 3, backgroundColor: "#FF4D4D", borderRadius: 2 },
  name: { color: "#FFFFFF", fontSize: 13, marginTop: 6 },
  episode: { color: "#B3B3B3", fontSize: 12 },
});

export default ContinueWatchingRail;
