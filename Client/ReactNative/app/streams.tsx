import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getStreams, stopStream, type Stream } from "@/services/streamsService";
import { colors } from "@/constants/theme";

/** "Playing now": where this account is watching, with a way to stop a stream on another device. */
export default function StreamsScreen() {
  const insets = useSafeAreaInsets();
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStreams(await getStreams());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stop = async (stream: Stream) => {
    setStreams((prev) => prev?.filter((s) => s.id !== stream.id) ?? prev);
    try {
      await stopStream(stream.id);
    } catch {
      void load(); // it did not go through: show what the server has
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Playing now</Text>
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.message}>Error: {error}</Text>
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : streams === null ? (
        <ActivityIndicator style={styles.center} color={colors.text} />
      ) : streams.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.message}>Nothing is playing on your account.</Text>
        </View>
      ) : (
        <FlatList
          data={streams}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {item.device.model ?? item.device.platform}
                  {item.thisDevice ? " (this device)" : ""}
                </Text>
                <Text style={styles.note}>
                  {item.series} · Episode {item.episode}
                </Text>
              </View>
              {!item.thisDevice && (
                <TouchableOpacity
                  onPress={() => stop(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop playing on ${item.device.model ?? item.device.platform}`}
                >
                  <Text style={styles.stop}>Stop</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: colors.text, fontSize: 32 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  message: { color: colors.text, fontSize: 14 },
  retry: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surfaceHigh },
  retryText: { color: colors.text },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  note: { color: colors.textMuted, fontSize: 12 },
  stop: { color: colors.danger, fontSize: 14 },
});
