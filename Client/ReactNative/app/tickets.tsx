import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTickets, type Ticket } from "@/services/supportService";
import { colors } from "@/constants/theme";

const STATUS: Record<Ticket["status"], string> = {
  received: "Received",
  in_review: "In review",
  decided: "Decided",
  closed: "Closed",
};

/** Help → My tickets: the viewer's tickets, newest first, each with where it is. */
export default function TicketsScreen() {
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTickets()
        .then((list) => {
          setTickets(list);
          setError(null);
        })
        .catch(() => setError("Cannot load your tickets."));
    }, []),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My tickets</Text>
      </View>
      {error ? (
        <Text style={[styles.note, styles.pad]}>{error}</Text>
      ) : tickets === null ? (
        <ActivityIndicator color={colors.text} />
      ) : tickets.length === 0 ? (
        <Text style={[styles.note, styles.pad]}>You have no tickets.</Text>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: "/ticket", params: { id: item.id } } as any)}
              accessibilityRole="button"
              accessibilityLabel={`Ticket ${item.number}, ${STATUS[item.status]}`}
            >
              <View style={styles.flex}>
                <Text style={styles.text}>
                  #{item.number} · {item.kind === "grievance" ? "Grievance" : "Support"}
                </Text>
                <Text style={styles.note}>{new Date(item.receivedAt).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.status}>{STATUS[item.status]}</Text>
            </TouchableOpacity>
          )}
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
  pad: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  text: { color: colors.text, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 13 },
  status: { color: colors.gold, fontSize: 13 },
});
