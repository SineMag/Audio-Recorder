import Text from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const DOC_DIR = (FileSystem as any).documentDirectory as string | null;
const CACHE_DIR = (FileSystem as any).cacheDirectory as string | null;
const BASE_DIR = DOC_DIR ?? CACHE_DIR ?? null;
const RECORDINGS_DIR = BASE_DIR ? `${BASE_DIR}recordings/` : null;

type RecItem = {
  name: string;
  uri: string;
  size?: number;
  modified?: number;
};

const sanitizeFileName = (input: string) => {
  const safe = input
    .replace(/[/\\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9 _.-]/g, "")
    .trim()
    .replace(/^\.+/, "");
  return safe;
};

function useRecordingsList(isWeb: boolean, setError: (val: string | null) => void) {
  const [items, setItems] = useState<RecItem[]>([]);
  const [loading, setLoading] = useState(false);

  const ensureDir = useCallback(async () => {
    if (!RECORDINGS_DIR) {
      throw new Error("No base directory available for recordings");
    }
    try {
      const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, {
          intermediates: true,
        });
      }
    } catch (e) {
      setError("Unable to ensure recordings directory");
    }
  }, [setError]);

  const loadList = useCallback(async () => {
    if (isWeb) return; // not supported
    setLoading(true);
    try {
      await ensureDir();
      if (!RECORDINGS_DIR) {
        throw new Error("No base directory available for recordings");
      }
      const names = await FileSystem.readDirectoryAsync(RECORDINGS_DIR);
      const infos = await Promise.all(
        names.map((name) => FileSystem.getInfoAsync(RECORDINGS_DIR + name))
      );
      const recs: RecItem[] = names.map((name, idx) => {
        const info = infos[idx];
        let size: number | undefined;
        let modified: number | undefined;
        if (info.exists) {
          if ("size" in (info as any) && typeof (info as any).size === "number") {
            size = (info as any).size;
          }
          if (
            "modificationTime" in (info as any) &&
            typeof (info as any).modificationTime === "number"
          ) {
            modified = (info as any).modificationTime;
          }
        }
        return { name, uri: RECORDINGS_DIR + name, size, modified };
      });
      recs.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
      setItems(recs);
    } catch (e) {
      setError("Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, [ensureDir, isWeb, setError]);

  return { items, loading, loadList };
}

export default function PlayScreen() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [renameUri, setRenameUri] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const isWeb = Platform.OS === "web";

  const { items, loading, loadList } = useRecordingsList(isWeb, setError);

  useEffect(() => {
    loadList();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [loadList]);

  useFocusEffect(
    React.useCallback(() => {
      loadList();
      return () => {};
    }, [loadList])
  );

  const formatTime = (totalMillis: number) => {
    const totalSeconds = Math.floor(totalMillis / 1000);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  };

  const handlePlay = useCallback(
    async (item: RecItem) => {
      if (isWeb) return;
      setError(null);
      try {
        // toggle if same track loaded
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

        // new track
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        const { sound } = await Audio.Sound.createAsync({ uri: item.uri });
        sound.setOnPlaybackStatusUpdate((s: any) => {
          if (!s.isLoaded) return;
          if ("didJustFinish" in s && s.didJustFinish) {
            setIsPlaying(false);
            setPlaybackPosition(0);
          } else {
            setIsPlaying(!!s.isPlaying);
          }
          if ("positionMillis" in s && typeof s.positionMillis === "number") {
            setPlaybackPosition(s.positionMillis);
          }
          if ("durationMillis" in s && typeof s.durationMillis === "number") {
            setPlaybackDuration(s.durationMillis);
          }
        });
        soundRef.current = sound;
        setCurrentUri(item.uri);
        setPlaybackPosition(0);
        setPlaybackDuration(null);
        await sound.playAsync();
        setIsPlaying(true);
      } catch (e) {
        setError("Playback error");
      }
    },
    [currentUri, isWeb]
  );

  const handleDelete = useCallback(
    (item: RecItem) => {
      if (isWeb) return;
      Alert.alert(
        "Delete recording",
        "Are you sure you want to delete this recording?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                if (currentUri === item.uri && soundRef.current) {
                  await soundRef.current.unloadAsync();
                  soundRef.current = null;
                  setCurrentUri(null);
                  setIsPlaying(false);
                }
                await FileSystem.deleteAsync(item.uri, { idempotent: true });
                loadList();
              } catch (e) {
                setError("Failed to delete");
              }
            },
          },
        ]
      );
    },
    [currentUri, isWeb, loadList]
  );

  const startRename = useCallback((item: RecItem) => {
    const base = item.name.replace(/\.[^.]+$/, "");
    setRenameUri(item.uri);
    setRenameValue(base);
    setError(null);
  }, []);

  const cancelRename = useCallback(() => {
    setRenameUri(null);
    setRenameValue("");
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameUri) return;
    const trimmed = renameValue.trim();
    const safe = sanitizeFileName(trimmed);
    if (!safe) {
      setError("Name must include letters or numbers");
      return;
    }
    try {
      setError(null);
      const extMatch = renameUri.match(/\.([^.]+)(?:\?|$)/);
      const ext = extMatch?.[1] ?? "m4a";
      const baseDir = renameUri.substring(0, renameUri.lastIndexOf("/") + 1);
      const dest = `${baseDir}${safe}.${ext}`;
      if (dest === renameUri) {
        cancelRename();
        return;
      }
      await FileSystem.moveAsync({ from: renameUri, to: dest });
      cancelRename();
      loadList();
    } catch (e) {
      setError("Failed to rename");
    }
  }, [renameUri, renameValue, cancelRename, loadList]);

  const renderItem = useCallback(
    ({ item }: { item: RecItem }) => {
      const isCurrent = currentUri === item.uri;
      const hasProgress =
        isCurrent && playbackDuration !== null && playbackDuration > 0;
      const durationText = hasProgress
        ? formatTime(playbackDuration ?? 0)
        : "";
      return (
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.name}>{item.name}</Text>
            {item.size ? (
              <Text style={styles.meta}>
                {(item.size / 1024).toFixed(1)} KB
              </Text>
            ) : null}
            {item.modified ? (
              <Text style={styles.meta}>{formatDate(item.modified)}</Text>
            ) : null}
            {isCurrent ? (
              <Text style={styles.meta}>
                {formatTime(playbackPosition)}{" "}
                {hasProgress ? ` / ${durationText}` : ""}
              </Text>
            ) : null}
          </View>
          <View style={styles.rowActions}>
            <TouchableOpacity
              onPress={() => startRename(item)}
              style={[styles.iconBtn, styles.renameBtn]}
            >
              <Ionicons name={"create"} size={20} color={"#ffffff"} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handlePlay(item)}
              style={styles.iconBtn}
            >
              <Ionicons
                name={isCurrent && isPlaying ? "pause" : "play"}
                size={20}
                color={"#ffffff"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={[styles.iconBtn, styles.deleteBtn]}
            >
              <Ionicons name={"trash"} size={20} color={"#ffffff"} />
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [
      currentUri,
      isPlaying,
      handlePlay,
      handleDelete,
      playbackDuration,
      playbackPosition,
      startRename,
    ]
  );

  const filteredItems = items.filter((it) =>
    it.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (isWeb) {
    return (
      <ThemedView style={styles.container}>
        <Text>
          Recordings are not available on web. Please use a device or emulator.
        </Text>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.searchRow}>
        <TextInput
          placeholder="Search recordings..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholderTextColor="#6b7280"
        />
      </View>
      {renameUri ? (
        <View style={styles.renameBar}>
          <TextInput
            value={renameValue}
            onChangeText={setRenameValue}
            style={styles.renameInput}
            placeholder="New name"
            placeholderTextColor="#6b7280"
            autoFocus
          />
          <View style={styles.renameActions}>
            <TouchableOpacity
              onPress={cancelRename}
              style={[styles.iconBtn, styles.cancelBtn]}
            >
              <Ionicons name="close" size={20} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={submitRename} style={styles.iconBtn}>
              <Ionicons name="checkmark" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <FlatList
        data={filteredItems}
        keyExtractor={(it) => it.uri}
        renderItem={renderItem}
        onRefresh={loadList}
        refreshing={loading}
        contentContainerStyle={
          filteredItems.length === 0 ? styles.emptyWrap : undefined
        }
        ListEmptyComponent={<Text>No recordings yet</Text>}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    justifyContent: "flex-start",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.icon,
  },
  rowInfo: {
    flexDirection: "column",
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontWeight: "600",
  },
  meta: {
    opacity: 0.6,
    marginTop: 2,
    fontSize: 12,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteBtn: {
    backgroundColor: "#ef4444",
  },
  renameBtn: {
    backgroundColor: "#2563eb",
  },
  cancelBtn: {
    backgroundColor: "#9ca3af",
  },
  error: {
    color: "#ef4444",
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  searchRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f9fafb",
    color: "#111827",
  },
  renameBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f9fafb",
    color: "#111827",
  },
  renameActions: {
    flexDirection: "row",
    gap: 8,
  },
});
