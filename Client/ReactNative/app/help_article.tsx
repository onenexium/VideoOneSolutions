import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLanguage } from "@/services/i18n";
import { getHelpArticle, type HelpArticle } from "@/services/supportService";

/** Markdown kept to plain text: articles are short paragraphs; bold and links read fine without marks. */
const plain = (markdown: string) => markdown.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)");

export default function HelpArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHelpArticle(slug, getLanguage())
      .then(setArticle)
      .catch(() => setError("This article is not available."));
  }, [slug]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={[styles.text, styles.pad]}>{error}</Text>
      ) : !article ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.title} accessibilityRole="header">
            {article.title}
          </Text>
          {plain(article.body)
            .split(/\n{2,}/)
            .map((paragraph, i) => (
              <Text key={i} style={styles.text}>
                {paragraph}
              </Text>
            ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48 },
  back: { color: "#FFFFFF", fontSize: 32 },
  pad: { padding: 16, gap: 14 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  text: { color: "#DDDDDD", fontSize: 15, lineHeight: 22 },
});
