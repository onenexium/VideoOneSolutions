import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { ApiError } from "@/services/api";
import type { MySeries } from "@/services/dramaService";
import { fetchMySeries } from "@/services/dramaService";
import {
  getWallet,
  newIdempotencyKey,
  refusalOf,
  setAutoUnlock,
  unlock,
  type Wallet,
} from "@/services/walletService";

interface Props {
  series: string;
  episode: number;
  /** The price the viewer is shown; it is also what is sent as `expectedCoins`. */
  coins: number;
  /** Episodes that were unlocked now (or were already the viewer's): they can play. */
  onUnlocked: (episodes: number[]) => void;
  /** "Not now": leave the locked episode (the player goes back). */
  onDismiss: () => void;
}

/**
 * A locked episode: its price in coins, the viewer's balance, and Unlock. What is shown is what is
 * charged: if the price moved the server refuses and this shows the new price to confirm. One
 * Idempotency-Key per intent, kept across retries and replaced only when the intent changes.
 */
const UnlockSheet: React.FC<Props> = ({ series, episode, coins, onUnlocked, onDismiss }) => {
  const [price, setPrice] = useState(coins);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [mine, setMine] = useState<MySeries | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  // One key per intent (what, at which price), kept across retries, dropped once it is done.
  const keysRef = useRef(new Map<string, string>());
  const keyFor = (target: { episode?: number; coins: number }) => {
    const intent = `${target.episode ?? "all"}@${target.coins}`;
    if (!keysRef.current.has(intent)) keysRef.current.set(intent, newIdempotencyKey());
    return { intent, key: keysRef.current.get(intent)! };
  };

  useEffect(() => {
    setPrice(coins);
  }, [coins]);

  useEffect(() => {
    let live = true;
    getWallet()
      .then((w) => live && setWallet(w))
      .catch((error) => {
        if (live && refusalOf(error)?.reason === "login-needed") setNeedsLogin(true);
      });
    fetchMySeries(series).then((m) => {
      if (live && m) {
        setMine(m);
        setAuto(m.autoUnlock);
      }
    });
    return () => {
      live = false;
    };
  }, [series, episode]);

  const run = async (target: { episode?: number; coins: number }) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const { intent, key } = keyFor(target);
    try {
      const result = await unlock({
        series,
        episode: target.episode,
        expectedCoins: target.coins,
        idempotencyKey: key,
      });
      keysRef.current.delete(intent); // the intent is done
      setWallet(await getWallet().catch(() => wallet));
      onUnlocked(result.episodes);
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal?.reason === "price-changed") {
        keysRef.current.delete(intent); // a different intent at the new price: the viewer must confirm it
        setPrice(refusal.coins);
        setMessage(`The price changed to ${refusal.coins} coins. Please confirm.`);
      } else if (refusal?.reason === "insufficient-coins") {
        setMessage("You do not have enough coins.");
      } else if (refusal?.reason === "wallet-in-debt") {
        setMessage("You owe coins from a refund. New coins settle that first.");
      } else if (refusal?.reason === "login-needed") {
        setNeedsLogin(true);
      } else if (error instanceof ApiError) {
        setMessage(error.message);
      } else {
        setMessage("Cannot reach the server. Check your connection and try again."); // the same key is kept
      }
    } finally {
      setBusy(false);
    }
  };

  const spendable = wallet ? wallet.purchased + wallet.promo : null;
  const offer = mine?.seriesUnlock && mine.seriesUnlock.episodes.length > 1 ? mine.seriesUnlock : null;
  const short = spendable !== null && spendable < price;

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>Episode {episode} is locked</Text>
        {needsLogin ? (
          <>
            <Text style={styles.hint}>Log in to unlock episodes with coins.</Text>
            <TouchableOpacity style={styles.primary} onPress={() => router.push("/login" as any)}>
              <Text style={styles.primaryText}>Log in</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              {spendable === null ? " " : `You have ${spendable} coins`}
              {wallet && wallet.debt > 0 ? ` · ${wallet.debt} owed` : ""}
            </Text>
            <TouchableOpacity
              style={[styles.primary, busy && styles.disabled]}
              disabled={busy}
              accessibilityRole="button"
              onPress={() => run({ episode, coins: price })}
            >
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>Unlock for {price} coins</Text>}
            </TouchableOpacity>
            {offer && (
              <TouchableOpacity
                style={[styles.secondary, busy && styles.disabled]}
                disabled={busy}
                accessibilityRole="button"
                onPress={() => run({ coins: offer.coins })}
              >
                <Text style={styles.secondaryText}>
                  Unlock all {offer.episodes.length} episodes for {offer.coins} coins
                </Text>
              </TouchableOpacity>
            )}
            {(short || message === "You do not have enough coins.") && (
              <TouchableOpacity onPress={() => router.push("/rewards" as any)}>
                <Text style={styles.link}>Earn free coins · Buying coins is coming soon</Text>
              </TouchableOpacity>
            )}
            <View style={styles.autoRow}>
              <Text style={styles.autoText}>Unlock the next episodes automatically</Text>
              <Switch
                value={auto}
                onValueChange={(on) => {
                  setAuto(on);
                  setAutoUnlock(series, on).catch(() => setAuto(!on));
                }}
                accessibilityLabel="Unlock the next episodes automatically"
              />
            </View>
          </>
        )}
        {message && <Text style={styles.error}>{message}</Text>}
        <TouchableOpacity onPress={onDismiss} accessibilityRole="button">
          <Text style={styles.link}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)", zIndex: 500 },
  sheet: { backgroundColor: "#121212", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 12 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  hint: { color: "#B3B3B3", fontSize: 14 },
  primary: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 50, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#000000", fontSize: 16, fontWeight: "700" },
  secondary: { backgroundColor: "#2A2A2A", borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  link: { color: "#FFFFFF", textAlign: "center", textDecorationLine: "underline", paddingVertical: 4 },
  autoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  autoText: { color: "#DDDDDD", fontSize: 13, flex: 1 },
  error: { color: "#FF6B6B", fontSize: 13 },
});

export default UnlockSheet;
