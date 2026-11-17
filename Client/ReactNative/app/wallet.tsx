import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getWallet,
  getWalletHistory,
  type Wallet,
  type WalletEntry,
} from "@/services/walletService";

const LABEL: Record<WalletEntry["type"], string> = {
  unlock: "Episode unlocked",
  purchase: "Coins bought",
  undo: "Unlock undone",
  bonus: "Free coins",
  expiry: "Coins expired",
  refund: "Refund",
};

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const generationRef = useRef(0);

  // Always the server's figures; shown again each time the screen is opened.
  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setError(null);
    try {
      const [w, h] = await Promise.all([getWallet(), getWalletHistory()]);
      if (generation !== generationRef.current) return;
      setWallet(w);
      setEntries(h.items);
      cursorRef.current = h.nextCursor;
    } catch (err) {
      if (generation === generationRef.current) setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => () => void generationRef.current++, []);

  const loadMore = async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const generation = generationRef.current;
    try {
      const page = await getWalletHistory(cursor);
      if (generation !== generationRef.current) return;
      cursorRef.current = page.nextCursor;
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...page.items.filter((e) => !seen.has(e.id))];
      });
    } catch {
      // The next time the end is reached tries again.
    } finally {
      loadingMoreRef.current = false;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Wallet</Text>
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.message}>Error: {error}</Text>
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !wallet ? (
        <ActivityIndicator style={styles.center} color="#FFFFFF" />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={styles.total}>{wallet.total} coins</Text>
              <Text style={styles.line}>Bought: {wallet.purchased} (never expire)</Text>
              <Text style={styles.line}>Free: {wallet.promo}</Text>
              {wallet.promoByExpiry.map((p) => (
                <Text key={p.expiresOn} style={styles.expiry}>
                  {p.coins} free coins expire on {day(p.expiresOn)}
                </Text>
              ))}
              {wallet.debt > 0 && (
                <Text style={styles.debt}>
                  You owe {wallet.debt} coins from a refund. New coins settle this first, and episodes stay locked until it is paid.
                </Text>
              )}
              <TouchableOpacity style={styles.earn} onPress={() => router.push("/rewards" as any)}>
                <Text style={styles.earnText}>Earn free coins</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>History</Text>
            </View>
          }
          ListEmptyComponent={<Text style={[styles.message, styles.emptyHistory]}>No coin activity yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{LABEL[item.type] ?? item.type}</Text>
                <Text style={styles.note}>{day(item.at)}{item.source ? ` · ${item.source}` : ""}</Text>
              </View>
              <Text style={[styles.amount, item.coins < 0 && styles.spent]}>
                {item.coins !== 0 ? sign(item.coins) : item.debt !== 0 ? `${sign(item.debt)} owed` : "0"}
              </Text>
            </View>
          )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  message: { color: "#FFFFFF", fontSize: 14 },
  emptyHistory: { textAlign: "center", marginTop: 12 },
  retry: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: "#333333" },
  retryText: { color: "#FFFFFF" },
  summary: { padding: 16, gap: 6 },
  total: { color: "#FFFFFF", fontSize: 32, fontWeight: "700" },
  line: { color: "#DDDDDD", fontSize: 14 },
  expiry: { color: "#E5A00D", fontSize: 13 },
  debt: { color: "#FF6B6B", fontSize: 13, marginTop: 6 },
  earn: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 12 },
  earnText: { color: "#000000", fontWeight: "700" },
  sectionTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 18 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: "#FFFFFF", fontSize: 15 },
  note: { color: "#B3B3B3", fontSize: 12 },
  amount: { color: "#5BD98A", fontSize: 15, fontWeight: "700" },
  spent: { color: "#FFFFFF" },
});
