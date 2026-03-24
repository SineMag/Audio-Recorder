import Text from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  ensureRecordingsDir,
  extractExtension,
  formatFileSize,
  formatMillis,
  formatModifiedDate,
  normalizeTimestamp,
  RecordingItem,
  RECORDINGS_DIR,
  sanitizeRecordingName,
} from "@/constants/recordings";
import { Colors, Fonts, Palette } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

function useRecordingsList(
  isWeb: boolean,
  setError: (value: string | null) => void,
) {
  const [items, setItems] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    if (isWeb || !RECORDINGS_DIR) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await ensureRecordingsDir();
      const names = await FileSystem.readDirectoryAsync(RECORDINGS_DIR);
      const infos = await Promise.all(
        names.map((name) =>
          FileSystem.getInfoAsync(`${RECORDINGS_DIR}${name}`),
        ),
      );

      const recordings = names.map((name, index) => {
        const info = infos[index] as any;
        return {
          name,
          uri: `${RECORDINGS_DIR}${name}`,
          size: typeof info?.size === "number" ? info.size : undefined,
          modified: normalizeTimestamp(info?.modificationTime),
        };
      });

      recordings.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
      setItems(recordings);
    } catch {
      setError("Failed to load recordings.");
    } finally {
      setLoading(false);
    }
  }, [isWeb, setError]);

  return { items, loading, loadList };
}

export default function PlayScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const isTablet = width >= 700;
  const isWeb = Platform.OS === "web";
  const soundRef = useRef<Audio.Sound | null>(null);

  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [renameUri, setRenameUri] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [deleteItem, setDeleteItem] = useState<RecordingItem | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const deleteMessageOpacity = useRef(new Animated.Value(0)).current;
  const deleteMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { items, loading, loadList } = useRecordingsList(isWeb, setError);

  const stopAndUnloadCurrent = useCallback(async () => {
    if (!soundRef.current) return;

    try {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await soundRef.current.stopAsync();
      }
    } catch {}

    try {
      await soundRef.current.unloadAsync();
    } catch {}

    soundRef.current = null;
    setIsPlaying(false);
    setPlaybackPosition(0);
    setPlaybackDuration(null);
  }, []);

  useEffect(() => {
    loadList();
    return () => {
      stopAndUnloadCurrent();
    };
  }, [loadList, stopAndUnloadCurrent]);

  useFocusEffect(
    React.useCallback(() => {
      loadList();
      return () => {
        stopAndUnloadCurrent();
      };
    }, [loadList, stopAndUnloadCurrent]),
  );

  // Cleanup animation timer on unmount
  useEffect(() => {
    return () => {
      if (deleteMessageTimer.current) {
        clearTimeout(deleteMessageTimer.current);
      }
    };
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, search]);

  const handlePlay = useCallback(
    async (item: RecordingItem) => {
      if (isWeb) return;

      setError(null);

      try {
        if (currentUri === item.uri && soundRef.current) {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded && status.isPlaying) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
          } else {
            await soundRef.current.playAsync();
            setIsPlaying(true);
          }
          return;
        }

        await stopAndUnloadCurrent();

        const { sound } = await Audio.Sound.createAsync({ uri: item.uri });
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (!status.isLoaded) return;

          if ("didJustFinish" in status && status.didJustFinish) {
            setIsPlaying(false);
            setPlaybackPosition(0);
          } else {
            setIsPlaying(!!status.isPlaying);
          }

          if (
            "positionMillis" in status &&
            typeof status.positionMillis === "number"
          ) {
            setPlaybackPosition(status.positionMillis);
          }

          if (
            "durationMillis" in status &&
            typeof status.durationMillis === "number"
          ) {
            setPlaybackDuration(status.durationMillis);
          }
        });

        soundRef.current = sound;
        setCurrentUri(item.uri);
        setPlaybackPosition(0);
        setPlaybackDuration(null);
        await sound.playAsync();
        setIsPlaying(true);
      } catch {
        setError("Playback failed for this recording.");
      }
    },
    [currentUri, isWeb, stopAndUnloadCurrent],
  );

  const handleDelete = useCallback(
    (item: RecordingItem) => {
      if (isWeb) return;
      setDeleteItem(item);
      setShowDeletePrompt(true);
    },
    [isWeb],
  );

  const proceedWithDelete = useCallback(async () => {
    if (!deleteItem) return;

    setShowDeletePrompt(false);

    try {
      if (currentUri === deleteItem.uri) {
        await stopAndUnloadCurrent();
        setCurrentUri(null);
      }

      const deletedName = deleteItem.name;
      await FileSystem.deleteAsync(deleteItem.uri, { idempotent: true });

      if (renameUri === deleteItem.uri) {
        setRenameUri(null);
        setRenameValue("");
      }

      setDeleteItem(null);
      await loadList();

      // Show snackbar with smooth animation
      setDeleteMessage(`${deletedName} deleted`);
      deleteMessageOpacity.setValue(0);

      Animated.sequence([
        Animated.timing(deleteMessageOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2500),
        Animated.timing(deleteMessageOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setDeleteMessage(null);
      });

      // Clear any existing timer
      if (deleteMessageTimer.current) {
        clearTimeout(deleteMessageTimer.current);
      }

      // Fallback timer to ensure message clears
      deleteMessageTimer.current = setTimeout(() => {
        setDeleteMessage(null);
      }, 3200);
    } catch {
      setError("Failed to delete that recording.");
    }
  }, [
    deleteItem,
    currentUri,
    stopAndUnloadCurrent,
    renameUri,
    loadList,
    deleteMessageOpacity,
  ]);

  const startRename = useCallback((item: RecordingItem) => {
    setRenameUri(item.uri);
    setRenameValue(item.name.replace(/\.[^.]+$/, ""));
    setError(null);
  }, []);

  const cancelRename = useCallback(() => {
    setRenameUri(null);
    setRenameValue("");
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameUri) return;

    const safeName = sanitizeRecordingName(renameValue.trim());
    if (!safeName) {
      setError("Name must include letters or numbers.");
      return;
    }

    try {
      setError(null);

      const extension = extractExtension(renameUri);
      const baseDir = renameUri.slice(0, renameUri.lastIndexOf("/") + 1);
      const destination = `${baseDir}${safeName}.${extension}`;

      if (destination === renameUri) {
        cancelRename();
        return;
      }

      const existing = await FileSystem.getInfoAsync(destination);
      if (existing.exists) {
        setError("A recording with that name already exists.");
        return;
      }

      await FileSystem.moveAsync({ from: renameUri, to: destination });

      if (currentUri === renameUri) {
        setCurrentUri(destination);
      }

      cancelRename();
      await loadList();
    } catch {
      setError("Failed to rename that recording.");
    }
  }, [cancelRename, currentUri, loadList, renameUri, renameValue]);

  const summaryText = useMemo(() => {
    if (items.length === 0) return "No local recordings yet";
    if (!search.trim()) {
      return `${items.length} recording${items.length === 1 ? "" : "s"} stored`;
    }
    return `${filteredItems.length} match${filteredItems.length === 1 ? "" : "es"} for "${search.trim()}"`;
  }, [filteredItems.length, items.length, search]);

  const renderRecording = useCallback(
    ({ item }: { item: RecordingItem }) => {
      const isCurrent = currentUri === item.uri;
      const isRenaming = renameUri === item.uri;

      return (
        <View
          style={[styles.recordingCard, isWide && styles.recordingCardWide]}
        >
          <View style={styles.recordingHeader}>
            <View style={styles.recordingCopy}>
              <Text style={styles.recordingName}>{item.name}</Text>
              <Text style={styles.recordingMeta}>
                {formatFileSize(item.size)} |{" "}
                {formatModifiedDate(item.modified)}
              </Text>
              {isCurrent ? (
                <Text style={styles.progressText}>
                  {formatMillis(playbackPosition)}
                  {playbackDuration
                    ? ` / ${formatMillis(playbackDuration)}`
                    : ""}
                </Text>
              ) : null}
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isCurrent ? (isPlaying ? "Playing" : "Loaded") : "Ready"}
              </Text>
            </View>
          </View>

          {isRenaming ? (
            <View style={styles.renameRow}>
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Recording name"
                placeholderTextColor="#64748b"
                autoFocus
                style={styles.renameInput}
              />
              <View style={styles.renameActions}>
                <Pressable
                  onPress={cancelRename}
                  style={({ pressed }) => [
                    styles.iconAction,
                    styles.cancelAction,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="close" size={18} color="#e2e8f0" />
                </Pressable>
                <Pressable
                  onPress={submitRename}
                  style={({ pressed }) => [
                    styles.iconAction,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color="#081018" />
                </Pressable>
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.recordingActions,
              isTablet && styles.recordingActionsWide,
            ]}
          >
            <Pressable
              onPress={() => handlePlay(item)}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Ionicons
                name={isCurrent && isPlaying ? "pause" : "play"}
                size={18}
                color="#081018"
              />
              <Text style={styles.actionText}>
                {isCurrent && isPlaying ? "Pause" : "Play"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => startRename(item)}
              style={({ pressed }) => [
                styles.actionButton,
                styles.outlineButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Ionicons name="create-outline" size={18} color="#f8fafc" />
              <Text style={styles.outlineText}>Rename</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDelete(item)}
              style={({ pressed }) => [
                styles.actionButton,
                styles.dangerButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Ionicons name="trash-outline" size={18} color="#fff7ed" />
              <Text style={styles.dangerText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [
      cancelRename,
      currentUri,
      handleDelete,
      handlePlay,
      isPlaying,
      isTablet,
      isWide,
      playbackDuration,
      playbackPosition,
      renameUri,
      renameValue,
      startRename,
      submitRename,
    ],
  );

  if (isWeb) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.webCard, isWide && styles.webCardWide]}>
          <Text style={styles.webEyebrow}>Render-ready web demo</Text>
          <Text style={styles.webTitle}>
            The web build is for showcasing the UI
          </Text>
          <Text style={styles.webText}>
            Expo web can host the library and recording interface, but live
            microphone capture for this app still needs Android or iOS. Render
            is still useful for shipping a public demo link.
          </Text>
          <View style={styles.webBullets}>
            <Text style={styles.webBullet}>Static export goes to `dist/`.</Text>
            <Text style={styles.webBullet}>
              Use a Render static site with a rewrite to `index.html`.
            </Text>
            <Text style={styles.webBullet}>
              Add your final Render URL to the README after deploy.
            </Text>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.uri}
        renderItem={renderRecording}
        refreshing={loading}
        onRefresh={loadList}
        contentContainerStyle={[
          styles.listContent,
          isWide && styles.listContentWide,
        ]}
        ListHeaderComponent={
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Saved recordings</Text>
            <Text style={styles.title}>Manage your library</Text>
            <Text style={styles.subtitle}>
              Search, preview, rename, and remove files stored on this device.
            </Text>

            <View style={styles.heroIcons}>
              <View style={styles.heroIconBubble}>
                <Ionicons
                  name="headset-outline"
                  size={18}
                  color={Palette.magenta}
                />
              </View>
              <View style={styles.heroIconBubble}>
                <Ionicons
                  name="sparkles-outline"
                  size={18}
                  color={Palette.yellow}
                />
              </View>
              <View style={styles.heroIconBubble}>
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={Palette.coral}
                />
              </View>
            </View>

            <View style={styles.searchShell}>
              <Ionicons name="search" size={18} color="#64748b" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by file name"
                placeholderTextColor="#64748b"
                style={styles.searchInput}
              />
              {search ? (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>{summaryText}</Text>
              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>
                  {items.length} total
                </Text>
              </View>
            </View>

            {error ? (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle" size={18} color="#f87171" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyCard, isWide && styles.emptyCardWide]}>
            <Ionicons name="mic-off-outline" size={28} color="#7dd3fc" />
            <Text style={styles.emptyTitle}>
              {search.trim()
                ? "No matching recordings"
                : "No saved recordings yet"}
            </Text>
            <Text style={styles.emptyText}>
              {search.trim()
                ? "Try a different search term or clear the filter."
                : "Create a recording from the first tab, then it will appear here."}
            </Text>
          </View>
        }
      />

      <Modal
        animationType="fade"
        transparent
        visible={showDeletePrompt && !!deleteItem}
        onRequestClose={() => setShowDeletePrompt(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBubble}>
                <Ionicons name="trash" size={20} color={Palette.ink} />
              </View>
              <Pressable
                onPress={() => setShowDeletePrompt(false)}
                style={({ pressed }) => [
                  styles.modalCloseButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="close" size={18} color="#f8fafc" />
              </Pressable>
            </View>

            <Text style={styles.namingTitle}>Delete {deleteItem?.name}?</Text>
            <Text style={styles.namingText}>
              This action cannot be undone. The recording will be permanently
              deleted from your device.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowDeletePrompt(false)}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="close" size={18} color="#f8fafc" />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={proceedWithDelete}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="trash" size={18} color="#f8fafc" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {deleteMessage ? (
        <Animated.View
          style={[
            styles.deleteSnackbar,
            {
              opacity: deleteMessageOpacity,
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={18} color="#34d399" />
          <Text style={styles.deleteSnackbarText}>{deleteMessage}</Text>
        </Animated.View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 16, paddingBottom: 120 },
  listContentWide: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 1180,
    padding: 24,
    paddingBottom: 132,
  },
  heroCard: {
    backgroundColor: "#341238",
    borderRadius: 24,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "#ff70cd",
    marginBottom: 16,
  },
  eyebrow: {
    color: Palette.yellow,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    fontFamily: Fonts.rounded,
  },
  subtitle: { color: "#ffe7f6", lineHeight: 22 },
  heroIcons: { flexDirection: "row", gap: 10 },
  heroIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5c1e4c",
    borderWidth: 1,
    borderColor: "#ff9cde",
  },
  searchShell: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#52194f",
    borderWidth: 1,
    borderColor: "#ff9cde",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, color: "#f8fafc", paddingVertical: 12 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  summaryText: { color: "#ffe7f6" },
  summaryBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#52194f",
    borderWidth: 1,
    borderColor: "#ff9cde",
  },
  summaryBadgeText: { color: Colors.light.tint, fontWeight: "700" },
  errorCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255, 112, 112, 0.18)",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.4)",
  },
  errorText: { color: "#fecaca", flex: 1 },
  recordingCard: {
    backgroundColor: "#341238",
    borderRadius: 22,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#ff70cd",
  },
  recordingCardWide: { alignSelf: "stretch" },
  recordingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  recordingCopy: { flex: 1, gap: 4 },
  recordingName: { fontSize: 18, fontWeight: "800" },
  recordingMeta: { color: "#fff3b0", fontSize: 13 },
  progressText: {
    color: Palette.yellow,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Fonts.mono,
    marginTop: 4,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#5c1e4c",
    borderWidth: 1,
    borderColor: "#ff9cde",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  badgeText: { color: "#e2e8f0", fontSize: 12, fontWeight: "700" },
  renameRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  renameInput: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#52194f",
    borderWidth: 1,
    borderColor: "#ff9cde",
    paddingHorizontal: 14,
    color: "#f8fafc",
  },
  renameActions: { flexDirection: "row", gap: 8 },
  iconAction: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelAction: { backgroundColor: "#6b1d57" },
  recordingActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  recordingActionsWide: { justifyContent: "flex-start" },
  actionButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionText: { color: "#081018", fontWeight: "800" },
  outlineButton: {
    backgroundColor: "#6b1d57",
    borderWidth: 1,
    borderColor: "#ff9cde",
  },
  outlineText: { color: "#f8fafc", fontWeight: "700" },
  dangerButton: { backgroundColor: Palette.coral },
  dangerText: { color: Palette.ink, fontWeight: "700" },
  emptyCard: {
    borderRadius: 24,
    backgroundColor: "#341238",
    borderWidth: 1,
    borderColor: "#ff70cd",
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyCardWide: { minHeight: 220, justifyContent: "center" },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: Fonts.rounded,
    textAlign: "center",
  },
  emptyText: { textAlign: "center", color: "#ffe7f6", lineHeight: 21 },
  webCard: {
    margin: 20,
    backgroundColor: "#341238",
    borderRadius: 24,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: "#ff70cd",
  },
  webCardWide: { alignSelf: "center", width: "100%", maxWidth: 980 },
  webEyebrow: {
    color: Palette.yellow,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 12,
    fontWeight: "700",
  },
  webTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    fontFamily: Fonts.rounded,
  },
  webText: { color: "#ffe7f6", lineHeight: 22 },
  webBullets: { gap: 8, marginTop: 4 },
  webBullet: { color: "#fff3b0" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 4, 12, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    padding: 20,
    gap: 14,
    backgroundColor: "#52194f",
    borderWidth: 1,
    borderColor: "#ff9cde",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalIconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.yellow,
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6b1d57",
    borderWidth: 1,
    borderColor: "#ff9cde",
  },
  namingTitle: { fontSize: 18, fontWeight: "800" },
  namingText: { color: "#ffe7f6", lineHeight: 20 },
  modalActions: { gap: 10, flexDirection: "row" },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#431542",
    borderWidth: 1,
    borderColor: "#b76aa2",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  cancelButtonText: { color: "#f8fafc", fontWeight: "700" },
  deleteButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: Palette.coral,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteButtonText: { color: Palette.ink, fontWeight: "800" },
  deleteSnackbar: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "rgba(52, 211, 153, 0.95)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  deleteSnackbarText: { color: "#082f2f", fontWeight: "700", fontSize: 14 },
  buttonPressed: { opacity: 0.82 },
});
