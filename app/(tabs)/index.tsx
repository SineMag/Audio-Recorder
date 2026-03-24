import Text from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  ensureRecordingsDir,
  extractExtension,
  formatDuration,
  formatFileSize,
  formatMillis,
  RECORDINGS_DIR,
  sanitizeRecordingName,
} from "@/constants/recordings";
import { Colors, Fonts, Palette } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

type PreviewMeta = {
  size?: number;
};

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isTablet = width >= 680;
  const isWeb = Platform.OS === "web";

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<PreviewMeta | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedName, setLastSavedName] = useState<string | null>(null);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [draftName, setDraftName] = useState("");

  const startTimeRef = useRef<number | null>(null);
  const previewUri = pendingUri ?? recordingUri;

  function getRecordingErrorMessage(error: unknown) {
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";

    if (!message) {
      return "Failed to start recording. Check microphone permission and try again.";
    }

    if (/simulator/i.test(message)) {
      return "Recording is not supported in the iOS simulator. Use a real device.";
    }

    return message;
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 250);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPaused, isRecording]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const statusText = useMemo(() => {
    if (isWeb) return "Web demo only";
    if (isRecording && isPaused) return "Paused";
    if (isRecording) return "Recording";
    if (pendingUri) return "Ready to save";
    if (recordingUri) return "Latest saved";
    return "Ready";
  }, [isPaused, isRecording, isWeb, pendingUri, recordingUri]);

  async function teardownSound() {
    if (!sound) return;

    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await sound.stopAsync();
      }
    } catch {}

    try {
      await sound.unloadAsync();
    } catch {}

    setSound(null);
    setIsPlaying(false);
    setPlaybackPosition(0);
    setPlaybackDuration(null);
  }

  async function hydratePreviewMeta(uri: string) {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in (info as any)) {
      setPreviewMeta({ size: (info as any).size });
      return;
    }
    setPreviewMeta(null);
  }

  async function startRecording() {
    setError(null);
    setLastSavedName(null);
    setShowSavePrompt(false);

    try {
      if (isWeb) {
        // For web, you can implement MediaRecorder API as an alternative
        // For now, inform user to use native app
        setError(
          "For best experience, use Expo Go app on mobile or build native apps with EAS.",
        );
        return;
      }

      // Request microphone permission
      const permission = await Audio.requestPermissionsAsync();

      if (permission.status !== "granted") {
        setError(
          "Microphone permission is required to record audio. Please enable it in your device settings.",
        );
        return;
      }

      await teardownSound();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      setPendingUri(null);
      setRecordingUri(null);
      setPreviewMeta(null);
      setElapsed(0);

      const nextRecording = new Audio.Recording();
      await nextRecording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await nextRecording.startAsync();

      startTimeRef.current = Date.now();
      setRecording(nextRecording);
      setIsRecording(true);
      setIsPaused(false);
    } catch (error) {
      console.log("Failed to start recording", error);
      setError(getRecordingErrorMessage(error));
    }
  }

  async function pauseRecording() {
    if (!recording) return;

    try {
      await (recording as any).pauseAsync?.();
      setIsPaused(true);
    } catch {
      setError("Failed to pause the current recording.");
    }
  }

  async function resumeRecording() {
    if (!recording) return;

    try {
      startTimeRef.current = Date.now() - elapsed * 1000;
      await (recording as any).startAsync?.();
      setIsPaused(false);
    } catch {
      setError("Failed to resume the recording.");
    }
  }

  async function stopRecording() {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);

      if (!uri) {
        setError("No recording file was created.");
        return;
      }

      await teardownSound();
      setPendingUri(uri);
      setDraftName(`recording-${new Date().getTime()}`);
      await hydratePreviewMeta(uri);
    } catch {
      setError("Failed to stop recording.");
    }
  }

  async function togglePlayback() {
    if (!previewUri) return;
    setError(null);

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

      const { sound: createdSound } = await Audio.Sound.createAsync({
        uri: previewUri,
      });

      createdSound.setOnPlaybackStatusUpdate((status: any) => {
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

      setSound(createdSound);
      setPlaybackPosition(0);
      setPlaybackDuration(null);
      await createdSound.playAsync();
      setIsPlaying(true);
    } catch {
      setError("Playback failed for this recording.");
    }
  }

  async function discardPreview() {
    setError(null);
    setShowSavePrompt(false);

    try {
      await teardownSound();
      if (pendingUri) {
        await FileSystem.deleteAsync(pendingUri, { idempotent: true });
      }
    } catch {}

    setPendingUri(null);
    setRecordingUri(null);
    setPreviewMeta(null);
    setElapsed(0);
    setDraftName("");
    startTimeRef.current = null;
  }

  async function commitSave(customName?: string) {
    if (!pendingUri || !RECORDINGS_DIR) return;

    setError(null);
    setIsSaving(true);

    try {
      await teardownSound();
      await ensureRecordingsDir();

      const tmpInfo = await FileSystem.getInfoAsync(pendingUri);
      if (!tmpInfo.exists) {
        setError("Temporary recording could not be found.");
        return;
      }

      const ext = extractExtension(pendingUri);
      const cleaned = sanitizeRecordingName(customName?.trim() ?? "");
      const fileName = cleaned
        ? `${cleaned}.${ext}`
        : `rec_${Date.now()}.${ext}`;
      const destination = `${RECORDINGS_DIR}${fileName}`;
      const existing = await FileSystem.getInfoAsync(destination);

      if (existing.exists) {
        setError("A recording with that name already exists.");
        return;
      }

      try {
        await FileSystem.moveAsync({ from: pendingUri, to: destination });
      } catch {
        await FileSystem.copyAsync({ from: pendingUri, to: destination });
        await FileSystem.deleteAsync(pendingUri, { idempotent: true });
      }

      setRecordingUri(destination);
      setPendingUri(null);
      setLastSavedName(fileName);
      setShowSavePrompt(false);
      await hydratePreviewMeta(destination);
    } catch (saveError: any) {
      const message =
        typeof saveError?.message === "string"
          ? saveError.message
          : "Failed to save the recording.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
      >
        <View style={styles.topBlock}>
          <View style={styles.topHeader}>
            <View>
              <Text style={styles.eyebrow}>Record</Text>
              <Text style={styles.title}>Start recording</Text>
            </View>
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  isRecording && !isPaused
                    ? styles.statusDotLive
                    : styles.statusDotIdle,
                ]}
              />
              <Text style={styles.statusPillText}>{statusText}</Text>
            </View>
          </View>

          <View style={styles.timerPanel}>
            <Text style={styles.timerValue}>{formatDuration(elapsed)}</Text>
            <Text style={styles.timerLabel}>
              {isRecording ? "Elapsed recording time" : "Tap below to begin"}
            </Text>
          </View>

          <View
            style={[
              styles.primaryActions,
              isTablet && styles.primaryActionsWide,
            ]}
          >
            {!isRecording ? (
              <Pressable
                onPress={startRecording}
                style={({ pressed }) => [
                  styles.recordButton,
                  styles.recordButtonHero,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="mic" size={32} color={Palette.ink} />
                <Text style={styles.recordButtonText}>Start recording</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={stopRecording}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    styles.stopAction,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="stop" size={22} color={Palette.ink} />
                  <Text style={styles.secondaryActionText}>Stop</Text>
                </Pressable>
                <Pressable
                  onPress={isPaused ? resumeRecording : pauseRecording}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons
                    name={isPaused ? "play-forward" : "pause"}
                    size={22}
                    color={Palette.ink}
                  />
                  <Text style={styles.secondaryActionText}>
                    {isPaused ? "Resume" : "Pause"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {isRecording ? (
            <View style={styles.liveIndicator}>
              <View
                style={[styles.livePulse, isPaused && styles.livePulsePaused]}
              />
              <Text style={styles.liveText}>
                {isPaused ? "Recording paused" : "Recording in progress"}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.bottomGrid, isWide && styles.bottomGridWide]}>
          <View style={styles.previewPanel}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderCopy}>
                <Text style={styles.previewTitle}>Preview</Text>
                <Text style={styles.previewSubtitle}>
                  {pendingUri
                    ? "Listen back, then save with a custom name or skip naming."
                    : recordingUri
                      ? "Your latest saved file is still available here."
                      : "Your next take will appear here once you stop recording."}
                </Text>
              </View>
              <Ionicons
                name={
                  pendingUri
                    ? "radio"
                    : recordingUri
                      ? "save"
                      : "musical-notes-outline"
                }
                size={24}
                color={Palette.yellow}
              />
            </View>

            <View style={[styles.infoChips, isTablet && styles.infoChipsWide]}>
              <View style={styles.infoChip}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={Palette.yellow}
                />
                <Text style={styles.infoChipText}>
                  {formatMillis(playbackPosition)}
                  {playbackDuration
                    ? ` / ${formatMillis(playbackDuration)}`
                    : ""}
                </Text>
              </View>
              <View style={styles.infoChip}>
                <Ionicons
                  name="document-outline"
                  size={16}
                  color={Palette.pink}
                />
                <Text style={styles.infoChipText}>
                  {previewMeta
                    ? formatFileSize(previewMeta.size)
                    : "No file yet"}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.previewActions,
                isTablet && styles.previewActionsWide,
              ]}
            >
              <Pressable
                disabled={!previewUri}
                onPress={togglePlayback}
                style={({ pressed }) => [
                  styles.inlineButton,
                  !previewUri && styles.inlineButtonDisabled,
                  pressed && previewUri ? styles.buttonPressed : null,
                ]}
              >
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={18}
                  color={Palette.ink}
                />
                <Text style={styles.inlineButtonText}>
                  {isPlaying ? "Pause preview" : "Play preview"}
                </Text>
              </Pressable>
              <Pressable
                disabled={!pendingUri || isSaving}
                onPress={() => setShowSavePrompt(true)}
                style={({ pressed }) => [
                  styles.inlineButton,
                  !pendingUri && styles.inlineButtonDisabled,
                  pressed && pendingUri ? styles.buttonPressed : null,
                ]}
              >
                <Ionicons name="save-outline" size={18} color={Palette.ink} />
                <Text style={styles.inlineButtonText}>
                  {isSaving ? "Saving..." : "Save recording"}
                </Text>
              </Pressable>
              <Pressable
                disabled={!pendingUri && !recordingUri}
                onPress={discardPreview}
                style={({ pressed }) => [
                  styles.ghostButton,
                  !pendingUri && !recordingUri && styles.inlineButtonDisabled,
                  pressed && (pendingUri || recordingUri)
                    ? styles.buttonPressed
                    : null,
                ]}
              >
                <Ionicons name="trash-outline" size={18} color="#f8fafc" />
                <Text style={styles.ghostButtonText}>
                  {pendingUri ? "Discard take" : "Clear preview"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.summaryPanel}>
            <View style={styles.metricCard}>
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color={Palette.yellow}
              />
              <Text style={styles.metricLabel}>Storage</Text>
              <Text style={styles.metricValue}>Saved on this device only</Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.alertCard}>
            <Ionicons name="alert-circle" size={18} color="#f87171" />
            <Text style={styles.alertText}>{error}</Text>
          </View>
        ) : null}

        {lastSavedName ? (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={18} color="#34d399" />
            <Text style={styles.successText}>{lastSavedName} saved</Text>
          </View>
        ) : null}

        <Modal
          animationType="fade"
          transparent
          visible={showSavePrompt && !!pendingUri}
          onRequestClose={() => setShowSavePrompt(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIconBubble}>
                  <Ionicons name="save-outline" size={20} color={Palette.ink} />
                </View>
                <Pressable
                  onPress={() => setShowSavePrompt(false)}
                  style={({ pressed }) => [
                    styles.modalCloseButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="close" size={18} color="#f8fafc" />
                </Pressable>
              </View>

              <Text style={styles.namingTitle}>Name this recording?</Text>
              <Text style={styles.namingText}>
                Give it a custom name now, or skip and save with an automatic
                file name.
              </Text>

              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Optional recording name"
                placeholderTextColor="#ffd8ef"
                style={styles.nameInput}
                autoFocus
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => commitSave(draftName)}
                  style={({ pressed }) => [
                    styles.inlineButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color={Palette.ink} />
                  <Text style={styles.inlineButtonText}>Save with name</Text>
                </Pressable>
                <Pressable
                  onPress={() => commitSave()}
                  style={({ pressed }) => [
                    styles.ghostButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={18} color="#f8fafc" />
                  <Text style={styles.ghostButtonText}>Skip naming</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowSavePrompt(false)}
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="close" size={18} color="#f8fafc" />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  topBlock: {
    backgroundColor: "#341238",
    borderRadius: 24,
    padding: 20,
    gap: 18,
    borderWidth: 1,
    borderColor: "#ff70cd",
  },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
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
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#4b1643",
    borderWidth: 1,
    borderColor: "#ff9cde",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDotLive: { backgroundColor: Palette.magenta },
  statusDotIdle: { backgroundColor: Palette.yellow },
  statusPillText: { fontSize: 13, fontWeight: "700" },
  timerPanel: {
    borderRadius: 20,
    backgroundColor: "#52194f",
    borderWidth: 1,
    borderColor: "#ff9cde",
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  timerValue: {
    fontSize: 48,
    lineHeight: 54,
    fontWeight: "800",
    fontFamily: Fonts.mono,
  },
  timerLabel: { color: "#fff3b0", fontSize: 13 },
  primaryActions: { gap: 12 },
  primaryActionsWide: { flexDirection: "row", flexWrap: "wrap" },
  recordButton: {
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  recordButtonHero: { width: "100%" },
  recordButtonText: { color: Palette.ink, fontWeight: "800", fontSize: 16 },
  secondaryAction: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: 1,
  },
  stopAction: { backgroundColor: Palette.coral },
  secondaryActionText: { color: Palette.ink, fontWeight: "800" },
  liveIndicator: {
    minHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ff9cde",
    backgroundColor: "#52194f",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  livePulse: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 10,
    borderColor: "rgba(255, 20, 118, 0.32)",
    backgroundColor: Palette.magenta,
  },
  livePulsePaused: {
    opacity: 0.55,
    backgroundColor: Palette.yellow,
    borderColor: "rgba(254, 255, 0, 0.35)",
  },
  liveText: { color: "#fff3b0" },
  bottomGrid: { gap: 16 },
  bottomGridWide: { flexDirection: "row", alignItems: "flex-start" },
  previewPanel: {
    flex: 1.4,
    backgroundColor: "#341238",
    borderRadius: 24,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: "#ff70cd",
  },
  summaryPanel: { flex: 1, gap: 12 },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  previewHeaderCopy: { flex: 1, gap: 4 },
  previewTitle: { fontSize: 22, fontWeight: "800", fontFamily: Fonts.rounded },
  previewSubtitle: { color: "#ffe7f6", lineHeight: 21 },
  infoChips: { gap: 10 },
  infoChipsWide: { flexDirection: "row", flexWrap: "wrap" },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#52194f",
    borderWidth: 1,
    borderColor: "#ff9cde",
  },
  infoChipText: { color: "#fffcee", fontWeight: "700", fontFamily: Fonts.mono },
  previewActions: { gap: 12 },
  previewActionsWide: { flexDirection: "row", flexWrap: "wrap" },
  inlineButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  inlineButtonText: { color: Palette.ink, fontWeight: "800" },
  ghostButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#6b1d57",
    borderWidth: 1,
    borderColor: "#ff9cde",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ghostButtonText: { color: "#f8fafc", fontWeight: "700" },
  cancelButton: {
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
  nameInput: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#6b1d57",
    borderWidth: 1,
    borderColor: "#ff9cde",
    paddingHorizontal: 14,
    color: "#f8fafc",
  },
  modalActions: { gap: 10 },
  metricCard: {
    borderRadius: 18,
    backgroundColor: "#341238",
    borderWidth: 1,
    borderColor: "#ff70cd",
    padding: 16,
    gap: 6,
  },
  metricLabel: { color: "#fff3b0", fontSize: 13 },
  metricValue: { fontWeight: "700", fontSize: 16 },
  alertCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255, 112, 112, 0.18)",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.4)",
  },
  alertText: { color: "#fecaca", flex: 1 },
  successCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "rgba(254, 255, 0, 0.12)",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(254, 255, 0, 0.38)",
  },
  successText: { color: "#fff9bf", flex: 1 },
  inlineButtonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
});
