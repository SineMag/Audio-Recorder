import Text from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Palette } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

const cards = [
  {
    icon: "mic-outline" as const,
    title: "Fast recording flow",
    body: "Open the app and record immediately. Pause, resume, preview, then save when the take is right.",
    color: Palette.pink,
  },
  {
    icon: "create-outline" as const,
    title: "Optional naming",
    body: "Saving now prompts for a custom file name, but users can skip that step and keep moving.",
    color: Palette.yellow,
  },
  {
    icon: "folder-open-outline" as const,
    title: "Saved recordings tab",
    body: "All stored files live in a dedicated tab with search, playback, rename, and delete controls.",
    color: Palette.coral,
  },
  {
    icon: "globe-outline" as const,
    title: "Render web demo",
    body: "The exported web build is ready for Render hosting. It showcases the UI, while recording still requires mobile.",
    color: Palette.magenta,
  },
];

export default function ExploreScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, isWide && styles.contentWide]}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Explore</Text>
          <Text style={styles.title}>About the app</Text>
          <Text style={styles.subtitle}>
            This tab holds the extra product information so the recording screen can stay focused on the main action.
          </Text>
        </View>

        <View style={[styles.grid, isWide && styles.gridWide]}>
          {cards.map((card) => (
            <View key={card.title} style={[styles.card, isWide && styles.cardWide]}>
              <View style={[styles.iconBubble, { backgroundColor: card.color }]}>
                <Ionicons name={card.icon} size={22} color={Palette.ink} />
              </View>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardBody}>{card.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="people-outline" size={22} color={Palette.yellow} />
          <Text style={styles.noteTitle}>Playful, not exclusionary</Text>
          <Text style={styles.noteBody}>
            The visuals can lean girly and still stay usable for men and everyone else. The goal is character, not gatekeeping.
          </Text>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 120 },
  contentWide: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 1180,
    padding: 24,
    paddingBottom: 132,
  },
  hero: {
    backgroundColor: "#341238",
    borderRadius: 24,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: "#ff70cd",
  },
  eyebrow: {
    color: Palette.yellow,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    fontFamily: Fonts.rounded,
  },
  subtitle: {
    color: "#ffe7f6",
    lineHeight: 22,
  },
  grid: { gap: 16 },
  gridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  card: {
    backgroundColor: "#341238",
    borderRadius: 22,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "#ff70cd",
  },
  cardWide: {
    width: "48.8%",
  },
  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: Fonts.rounded,
  },
  cardBody: {
    color: "#ffe7f6",
    lineHeight: 21,
  },
  noteCard: {
    backgroundColor: "#52194f",
    borderRadius: 22,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "#ff9cde",
  },
  noteTitle: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: Fonts.rounded,
  },
  noteBody: {
    color: "#fff3b0",
    lineHeight: 21,
  },
});
