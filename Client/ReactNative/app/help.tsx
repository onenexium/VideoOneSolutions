import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLanguage } from "@/services/i18n";
import { getHelpArticles, getLegalDocument, type HelpArticleSummary, type LegalKind } from "@/services/supportService";

const TOPICS: Record<string, string> = {
  account: "Account and login",
  coins: "Coins",
  playback: "Playback",
  ratings: "Ratings",
  privacy: "Privacy",
  problem: "Report a problem",
};
const LEGAL: { kind: LegalKind; label: string }[] = [
  { kind: "terms", label: "Terms of use" },
  { kind: "privacy", label: "Privacy notice" },
  { kind: "refunds", label: "Refunds and cancellation" },
  { kind: "grievance", label: "Grievance officer" },
];

/** Help (deep dive 7, K1): answers by topic, contact support, the viewer's tickets, the legal pages. */
export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [articles, setArticles] = useState<HelpArticleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      getHelpArticles(getLanguage(), q.trim() || undefined)
        .then((list) => {
          setArticles(list);
          setError(null);
        })
        .catch(() => setError("Cannot load help right now."));
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const openLegal = async (kind: LegalKind) => {
    const doc = await getLegalDocument(kind, getLanguage()).catch(() => null);
    if (doc) await WebBrowser.openBrowserAsync(doc.url);
  };

  const groups = (articles ?? []).reduce<Record<string, HelpArticleSummary[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Help</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="Search help" placeholderTextColor="#777" accessibilityLabel="Search help" />
        {error ? (
          <Text style={styles.note}>{error}</Text>
        ) : articles === null ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : articles.length === 0 ? (
          <Text style={styles.note}>No answers found. Contact us below.</Text>
        ) : (
          Object.entries(groups).map(([topic, list]) => (
            <View key={topic} style={styles.group}>
              <Text style={styles.section}>{TOPICS[topic] ?? topic}</Text>
              {list.map((a) => (
                <TouchableOpacity
                  key={a.slug}
                  style={styles.row}
                  onPress={() => router.push({ pathname: "/help_article", params: { slug: a.slug } } as any)}
                  accessibilityRole="button"
                >
                  <Text style={styles.text}>{a.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}

        <Text style={styles.section}>Still need help?</Text>
        <TouchableOpacity style={styles.primary} onPress={() => router.push("/contact" as any)} accessibilityRole="button">
          <Text style={styles.primaryText}>Contact us</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => router.push("/tickets" as any)} accessibilityRole="button">
          <Text style={styles.secondaryText}>My tickets</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => router.push({ pathname: "/contact", params: { kind: "grievance" } } as any)}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>File a grievance</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Legal</Text>
        {LEGAL.map((l) => (
          <TouchableOpacity key={l.kind} style={styles.row} onPress={() => void openLegal(l.kind)} accessibilityRole="link">
            <Text style={styles.text}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: "#FFFFFF", fontSize: 32 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flex: 1 },
  body: { padding: 16, gap: 10 },
  input: { backgroundColor: "#1A1A1A", color: "#FFFFFF", borderRadius: 10, paddingHorizontal: 14, height: 44, fontSize: 15 },
  group: { gap: 6 },
  section: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", marginTop: 12 },
  row: { backgroundColor: "#1A1A1A", borderRadius: 10, padding: 14 },
  text: { color: "#FFFFFF", fontSize: 15 },
  note: { color: "#B3B3B3", fontSize: 13 },
  primary: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  secondary: { backgroundColor: "#2A2A2A", borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
