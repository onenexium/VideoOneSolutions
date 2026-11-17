import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/services/api";
import {
  claimCheckIn,
  getCheckIn,
  newIdempotencyKey,
  refusalOf,
  type CheckInState,
} from "@/services/walletService";

/** The daily check-in: a ladder of coins, claimed with a tap (never automatically). */
export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<CheckInState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key for this claim, kept if the answer is lost so the retry cannot claim twice.
  const claimKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await getCheckIn());
      setLoginNeeded(false);
    } catch (err) {
      if (refusalOf(err)?.reason === "login-needed") setLoginNeeded(true);
      else setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    claimKeyRef.current ??= newIdempotencyKey();
    try {
      const result = await claimCheckIn(claimKeyRef.current);
      claimKeyRef.current = null; // done
      setMessage(
        result.toBalanceDue > 0
          ? `${result.toBalanceDue} of your ${result.coins} coins went to your balance due.`
          : `You got ${result.coins} coins. Spend them by ${result.expiresOn}.`,
      );
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        claimKeyRef.current = null; // the server answered: a new try is a new claim
        const type = err.type.replace("urn:ott:error:", "");
        if (type === "checkin-already-claimed") {
          setMessage("You have already claimed today. Come back tomorrow.");
          await load();
        } else if (type === "checkin-unavailable") {
          setMessage("Check-in isn't available on this device today.");
        } else {
          setMessage(err.message);
        }
      } else {
        setMessage("Cannot reach the server. Try again."); // the same key is kept
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Free coins</Text>
      </View>
      {loginNeeded ? (
        <View style={styles.center}>
          <Text style={styles.message}>Log in to earn free coins.</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.push("/login" as any)}>
            <Text style={styles.buttonText}>Log in</Text>
          </TouchableOpacity>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.message}>Error: {error}</Text>
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !state ? (
        <ActivityIndicator style={styles.center} color="#FFFFFF" />
      ) : (
        <View style={styles.body}>
          <Text style={styles.heading}>Daily check-in</Text>
          <View style={styles.ladder}>
            {state.ladder.map((coins, i) => {
              const day = i + 1;
              const done = day < state.nextStep; // nextStep is tomorrow's once today is claimed
              const today = !state.claimedToday && day === state.nextStep;
              return (
                <View
                  key={day}
                  style={[styles.tile, done && styles.tileDone, today && styles.tileToday]}
                  accessible
                  accessibilityLabel={`Day ${day}, ${coins} coins, ${done ? "claimed" : today ? "ready to claim" : "to come"}`}
                >
                  <Text style={styles.tileDay}>Day {day}</Text>
                  <Text style={styles.tileCoins}>{coins}</Text>
                </View>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.button, (!state.canClaim || busy) && styles.disabled]}
            disabled={!state.canClaim || busy}
            accessibilityRole="button"
            onPress={claim}
          >
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>
                {state.claimedToday ? "Claimed today" : state.canClaim ? `Claim ${state.nextCoins} coins` : "Not available today"}
              </Text>
            )}
          </TouchableOpacity>
          {message && <Text style={styles.message}>{message}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: "#FFFFFF", fontSize: 32 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  body: { padding: 16, gap: 16 },
  heading: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  ladder: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: 72, paddingVertical: 12, borderRadius: 10, backgroundColor: "#1A1A1A", alignItems: "center", gap: 4 },
  tileDone: { opacity: 0.5 },
  tileToday: { backgroundColor: "#2A3A2F", borderWidth: 1, borderColor: "#5BD98A" },
  tileDay: { color: "#B3B3B3", fontSize: 11 },
  tileCoins: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  button: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  buttonText: { color: "#000000", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  message: { color: "#FFFFFF", fontSize: 14, textAlign: "center" },
  retry: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: "#333333" },
  retryText: { color: "#FFFFFF" },
});
