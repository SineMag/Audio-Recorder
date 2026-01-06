import Text from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

const DOC_DIR = (FileSystem as any).documentDirectory as string | null;
const BASE_DIR =
  DOC_DIR ?? ((FileSystem as any).cacheDirectory as string | null) ?? "";
const RECORDINGS_DIR = `${BASE_DIR}recordings/`;

type RecItem = {
  name: string;
  uri: string;
  size?: number;
  modified?: number;
};

export default function PlayScreen() {
  const [items, setItems] = useState<RecItem[]>([]);
  const [loading, setLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWeb = Platform.OS === "web";

  const ensureDir = useCallback(async () => {
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
  }, []);

  const loadList = useCallback(async () => {
    if (isWeb) return; // not supported
    setLoading(true);
    try {
      await ensureDir();
      const names = await FileSystem.readDirectoryAsync(RECORDINGS_DIR);
      const recs: RecItem[] = [];
      for (const name of names) {
        const uri = RECORDINGS_DIR + name;
        const info = await FileSystem.getInfoAsync(uri);
        let size: number | undefined;
        let modified: number | undefined;
        if (info.exists) {
          if (
            "size" in (info as any) &&
            typeof (info as any).size === "number"
          ) {
            size = (info as any).size;
          }
          if (
            "modificationTime" in (info as any) &&
            typeof (info as any).modificationTime === "number"
          ) {
            modified = (info as any).modificationTime;
          }
        }
        recs.push({ name, uri, size, modified });
      }
      // newest first
      recs.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
      setItems(recs);
    } catch (e) {
      setError("Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, [ensureDir, isWeb]);

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

  const handlePlay = useCallback(
    async (item: RecItem) => {
      if (isWeb) return;
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
          if ("didJustFinish" in s && s.didJustFinish) setIsPlaying(false);
          else setIsPlaying(!!s.isPlaying);
        });
        soundRef.current = sound;
        setCurrentUri(item.uri);
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

  const renderItem = useCallback(
    ({ item }: { item: RecItem }) => {
      const isCurrent = currentUri === item.uri;
      return (
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.name}>{item.name}</Text>
            {item.size ? (
              <Text style={styles.meta}>
                {(item.size / 1024).toFixed(1)} KB
              </Text>
            ) : null}
          </View>
          <View style={styles.rowActions}>
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
    [currentUri, isPlaying, handlePlay, handleDelete]
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
      <FlatList
        data={items}
        keyExtractor={(it) => it.uri}
        renderItem={renderItem}
        onRefresh={loadList}
        refreshing={loading}
        contentContainerStyle={
          items.length === 0 ? styles.emptyWrap : undefined
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
  error: {
    color: "#ef4444",
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
