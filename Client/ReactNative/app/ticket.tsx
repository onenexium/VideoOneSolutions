import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/services/api";
import { getTicket, replyToTicket, type TicketDetail } from "@/services/supportService";

/**
 * One ticket (deep dive 7, K2): the message as recorded, the replies, the decision and its reasons,
 * and for a decided grievance the appeal route. The viewer can reply until it is closed.
 */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTicket(id)
      .then(setTicket)
      .catch(() => setError("This ticket is not available."));
  }, [id]);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setTicket(await replyToTicket(id, reply.trim()));
      setReply("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Cannot reach the server.");
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
        <Text style={styles.title}>{ticket ? `Ticket #${ticket.number}` : "Ticket"}</Text>
      </View>
      {!ticket ? (
        error ? <Text style={[styles.note, styles.pad]}>{error}</Text> : <ActivityIndicator color="#FFFFFF" />
      ) : (
        <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.note}>
            {ticket.kind === "grievance" ? "Grievance" : "Support"} · received {new Date(ticket.receivedAt).toLocaleString()}
          </Text>
          {ticket.decideBy && !ticket.decidedAt && (
            <Text style={styles.note}>To be decided by {new Date(ticket.decideBy).toLocaleDateString()}</Text>
          )}
          <Text style={styles.label}>Your message</Text>
          <Text style={styles.text}>{ticket.message || "(no message)"}</Text>
          {ticket.events
            .filter((e) => e.kind === "reply")
            .map((e, i) => (
              <View key={i} style={[styles.bubble, e.by === "viewer" ? styles.mine : styles.theirs]}>
                <Text style={styles.note}>{e.by === "viewer" ? "You" : "Support"} · {new Date(e.at).toLocaleString()}</Text>
                <Text style={styles.text}>{e.body}</Text>
              </View>
            ))}
          {ticket.decision && (
            <>
              <Text style={styles.label}>Decision</Text>
              <Text style={styles.text}>{ticket.decision}</Text>
            </>
          )}
          {ticket.appealUrl && (
            <TouchableOpacity onPress={() => void WebBrowser.openBrowserAsync(ticket.appealUrl!)} accessibilityRole="link">
              <Text style={styles.link}>Not satisfied? Appeal to the self-regulatory body</Text>
            </TouchableOpacity>
          )}
          {ticket.status !== "closed" && (
            <>
              <TextInput style={[styles.input, styles.multiline]} value={reply} onChangeText={setReply} multiline maxLength={4000} placeholder="Write a reply" placeholderTextColor="#777" accessibilityLabel="Reply" />
              <TouchableOpacity style={[styles.primary, (busy || !reply.trim()) && styles.disabled]} disabled={busy || !reply.trim()} onPress={send} accessibilityRole="button">
                <Text style={styles.primaryText}>{busy ? "Sending…" : "Send reply"}</Text>
              </TouchableOpacity>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: "#FFFFFF", fontSize: 32 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flex: 1 },
  pad: { padding: 16, gap: 10 },
  label: { color: "#B3B3B3", fontSize: 13, marginTop: 8 },
  text: { color: "#FFFFFF", fontSize: 15, lineHeight: 21 },
  note: { color: "#B3B3B3", fontSize: 12 },
  bubble: { borderRadius: 10, padding: 12, gap: 4 },
  mine: { backgroundColor: "#1E2A3A", alignSelf: "flex-end", maxWidth: "90%" },
  theirs: { backgroundColor: "#1A1A1A", alignSelf: "flex-start", maxWidth: "90%" },
  link: { color: "#7DB2FF", fontSize: 14, textDecorationLine: "underline", paddingVertical: 8 },
  input: { backgroundColor: "#1A1A1A", color: "#FFFFFF", borderRadius: 10, paddingHorizontal: 14, minHeight: 48, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: "top", paddingTop: 12, marginTop: 12 },
  primary: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: "#FF6B6B", fontSize: 14 },
});
