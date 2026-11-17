import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DramaCover from "./DramaCover";
import type { DramaChannelMeta } from "@/types/drama";
import { colors } from "@/constants/theme";

const { width: screenWidth } = Dimensions.get("window");
const CARD_WIDTH = (screenWidth - 48) / 2;
const CARD_HEIGHT = CARD_WIDTH * (287 / 167.49);

interface CardGridProps {
  items: DramaChannelMeta[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  onRetry: () => void;
  onEndReached: () => void;
  onPress: (drama: DramaChannelMeta) => void;
  bottomInset?: number;
}

/** Two-column grid of series cards with loading, error, empty states and paging at the end. */
const CardGrid: React.FC<CardGridProps> = ({
  items,
  loading,
  error,
  emptyText,
  onRetry,
  onEndReached,
  onPress,
  bottomInset = 0,
}) => {
  if (loading) {
    return <ActivityIndicator style={styles.center} color={colors.text} />;
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Error: {error}</Text>
        <TouchableOpacity onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      numColumns={2}
      keyExtractor={(d) => d.dramaId}
      columnWrapperStyle={styles.row}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.5}
      renderItem={({ item }) => (
        <DramaCover
          drama={item}
          onPress={onPress}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          showPlayCount={false}
          showNewBadge={true}
          showRank={false}
          type="recommend"
        />
      )}
    />
  );
};

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 16, marginBottom: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  message: { color: colors.text, fontSize: 14 },
  retry: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surfaceHigh },
  retryText: { color: colors.text },
});

export default CardGrid;
