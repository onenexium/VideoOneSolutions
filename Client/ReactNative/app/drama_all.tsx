import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CardGrid from "@/components/drama/CardGrid";
import { usePagedCards } from "@/hooks/usePagedCards";
import { DramaService } from "@/services/dramaService";
import { openSeries } from "@/utils/openSeries";

/**
 * "See all": every series of one home rail (`rail`), or every series there is (Browse, no `rail`),
 * a page at a time as the viewer nears the end.
 */
export default function DramaAllScreen() {
  const { rail, title } = useLocalSearchParams<{ rail?: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const fetchPage = useCallback(
    (cursor?: string) =>
      rail ? DramaService.getRailPage(rail, cursor) : DramaService.getBrowsePage(cursor),
    [rail],
  );
  const { items, loading, error, reload, loadMore } = usePagedCards(fetchPage);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {title || "All series"}
        </Text>
      </View>
      <CardGrid
        items={items}
        loading={loading}
        error={error}
        emptyText="No series here yet"
        onRetry={reload}
        onEndReached={loadMore}
        onPress={openSeries}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48 },
  back: { color: "#FFFFFF", fontSize: 32, marginRight: 12 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flex: 1 },
});
