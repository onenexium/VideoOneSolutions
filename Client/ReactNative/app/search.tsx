import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CardGrid from "@/components/drama/CardGrid";
import DramaCover from "@/components/drama/DramaCover";
import { usePagedCards } from "@/hooks/usePagedCards";
import { getSearchSuggestions, searchSeries, type SearchSuggestions } from "@/services/libraryService";
import { openSeries } from "@/utils/openSeries";
import { colors } from "@/constants/theme";

const DEBOUNCE_MS = 350;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);

  // Search waits for a pause in typing; one letter is not a search.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    getSearchSuggestions().then(setSuggestions).catch(() => setSuggestions(null));
  }, []);

  const searching = query.length >= 2;
  const fetchPage = useCallback((cursor?: string) => searchSeries(query, cursor), [query]);
  const { items, loading, error, reload, loadMore } = usePagedCards(fetchPage, searching);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Search series, cast or genre"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search"
        />
        {text.length > 0 && (
          <TouchableOpacity onPress={() => setText("")} accessibilityRole="button" accessibilityLabel="Clear">
            <Text style={styles.clear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {searching ? (
        <CardGrid
          items={items}
          loading={loading}
          error={error}
          emptyText={`Nothing found for "${query}"`}
          onRetry={reload}
          onEndReached={loadMore}
          onPress={openSeries}
          bottomInset={insets.bottom}
        />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {suggestions === null ? (
            <ActivityIndicator style={styles.spinner} color={colors.text} />
          ) : (
            <>
              {suggestions.tropes.length > 0 && (
                <View style={styles.chips}>
                  {suggestions.tropes.map((trope) => (
                    <TouchableOpacity key={trope.slug} style={styles.chip} onPress={() => setText(trope.name)}>
                      <Text style={styles.chipText}>{trope.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {suggestions.series.length > 0 && <Text style={styles.section}>Popular searches</Text>}
              <View style={styles.suggested}>
                {suggestions.series.map((drama) => (
                  <DramaCover
                    key={drama.dramaId}
                    drama={drama}
                    onPress={openSeries}
                    width={110}
                    height={198}
                    showPlayCount={false}
                    showNewBadge={true}
                    showRank={false}
                    type="new"
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 56, gap: 8 },
  back: { color: colors.text, fontSize: 32 },
  input: { flex: 1, backgroundColor: colors.surface, color: colors.text, borderRadius: 10, paddingHorizontal: 14, height: 40, fontSize: 15 },
  clear: { color: colors.textMuted, fontSize: 18, paddingHorizontal: 6 },
  spinner: { marginTop: 40 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: colors.text, fontSize: 13 },
  section: { color: colors.text, fontSize: 18, fontWeight: "700", paddingHorizontal: 16, marginVertical: 12 },
  suggested: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16 },
});
