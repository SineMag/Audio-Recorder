import Text from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";

export default function HomeScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blink, setBlink] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);

  const DOC_DIR = (FileSystem as any).documentDirectory as string | null;
  const BASE_DIR =
    DOC_DIR ?? ((FileSystem as any).cacheDirectory as string | null) ?? "";
  const RECORDINGS_DIR = `${BASE_DIR}recordings/`;

  async function ensureRecordingsDir() {
    const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, {
        intermediates: true,
      });
    }
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isRecording) {
      interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 250);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) {
      setBlink(false);
      return;
    }
    const id = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  async function startRecording() {
    setError(null);
    try {
      if (Platform.OS === "web") {
        setError(
          "Recording is not supported on web. Please use a device or emulator."
        );
        return;
      }

      const current = await Audio.getPermissionsAsync();
      let status = current.status;
      if (status !== "granted") {
        const req = await Audio.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") {
        setError("Microphone permission is required");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Reset playback and pending state
      if (sound) {
        try {
          await sound.unloadAsync();
        } catch {}
        setSound(null);
      }
      setPendingUri(null);
      setRecordingUri(null);

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(recording);
      setIsRecording(true);
      setIsPaused(false);
    } catch (e) {
      setError("Failed to start recording");
    }
  }

  async function pauseRecording() {
    try {
      if (!recording) return;
      await (recording as any).pauseAsync?.();
      setIsPaused(true);
    } catch (e) {
      setError("Failed to pause");
    }
  }

  async function resumeRecording() {
    try {
      if (!recording) return;
      await (recording as any).startAsync?.();
      setIsPaused(false);
    } catch (e) {
      setError("Failed to resume");
    }
  }

  async function stopRecording() {
    try {
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
      if (!uri) {
        setError("No recording URI available");
        return;
      }
      // Keep as pending until user taps Save
      setPendingUri(uri);
    } catch (e) {
      setError("Failed to stop recording");
    }
  }

  async function togglePlayback() {
    const src = pendingUri ?? recordingUri;
    if (!src) return;
    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
          return;
        }
        await sound.playAsync();
        setIsPlaying(true);
        return;
      }
      const { sound: created } = await Audio.Sound.createAsync({ uri: src });
      created.setOnPlaybackStatusUpdate((s: any) => {
        if (!s.isLoaded) return;
        if ("didJustFinish" in s && s.didJustFinish) setIsPlaying(false);
        else setIsPlaying(!!s.isPlaying);
      });
      setSound(created);
      await created.playAsync();
      setIsPlaying(true);
    } catch (e) {
      setError("Playback error");
    }
  }

  function resetRecording() {
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
    setRecordingUri(null);
    setPendingUri(null);
    setElapsed(0);
    startTimeRef.current = null;
    setIsPlaying(false);
  }

  async function saveRecording() {
    try {
      if (!pendingUri) return;
      await ensureRecordingsDir();
      const extMatch = pendingUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      const ext = extMatch?.[1] ?? "m4a";
      const dest = `${RECORDINGS_DIR}rec_${Date.now()}.${ext}`;
      await FileSystem.moveAsync({ from: pendingUri, to: dest });
      setRecordingUri(dest);
      setPendingUri(null);
    } catch (e) {
      setError("Failed to save recording");
    }
  }

  function formatTime(totalSeconds: number) {
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.timer}>
          {isRecording
            ? `Recording · ${formatTime(elapsed)}`
            : elapsed > 0
            ? formatTime(elapsed)
            : ""}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.primaryRow}>
          {!isRecording && (
            <TouchableOpacity
              onPress={startRecording}
              style={styles.primaryBtn}
            >
              <View style={styles.iconWithLabel}>
                <Ionicons name="mic" size={36} color="#ffffff" />
                <Text style={styles.iconLabel}>Record</Text>
              </View>
            </TouchableOpacity>
          )}

          {isRecording && (
            <>
              <TouchableOpacity
                onPress={stopRecording}
                style={[styles.primaryBtn, styles.stopBtn]}
              >
                <View style={styles.iconWithLabel}>
                  <Ionicons name="stop" size={36} color="#ffffff" />
                  <Text style={styles.iconLabel}>Stop</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pauseRecording}
                style={styles.primaryBtn}
              >
                <View style={styles.iconWithLabel}>
                  <Ionicons name="pause" size={36} color="#ffffff" />
                  <Text style={styles.iconLabel}>Pause</Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          {!isRecording && elapsed > 0 && (
            <TouchableOpacity
              onPress={resumeRecording}
              style={styles.primaryBtn}
            >
              <View style={styles.iconWithLabel}>
                <Ionicons name="play" size={36} color="#ffffff" />
                <Text style={styles.iconLabel}>Continue</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {isRecording ? (
          <View style={styles.recordWrap}>
            <View style={[styles.pulse, { opacity: blink ? 1 : 0.3 }]} />
          </View>
        ) : null}

        <View style={styles.controls}>
          <TouchableOpacity
            disabled={!pendingUri && !recordingUri}
            onPress={togglePlayback}
            style={[
              styles.actionButton,
              !pendingUri && !recordingUri && styles.actionButtonDisabled,
            ]}
          >
            <View style={styles.iconWithLabel}>
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={20}
                color="#ffffff"
              />
              <Text style={styles.iconLabel}>Play</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!pendingUri}
            onPress={saveRecording}
            style={[
              styles.actionButton,
              !pendingUri && styles.actionButtonDisabled,
            ]}
          >
            <View style={styles.iconWithLabel}>
              <Ionicons name="save" size={20} color="#ffffff" />
              <Text style={styles.iconLabel}>Save</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  card: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 16,
  },
  timer: {
    fontSize: 16,
    opacity: 0.8,
  },
  error: {
    color: "#ef4444",
  },
  recordWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#ef4444",
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  recordButtonActive: {
    backgroundColor: "#ef4444",
  },
  recordLabel: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  controls: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#111827",
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
