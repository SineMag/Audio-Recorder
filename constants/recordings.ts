/* eslint-disable import/no-unresolved */
import * as FileSystem from "expo-file-system/legacy";

export type RecordingItem = {
  name: string;
  uri: string;
  size?: number;
  modified?: number;
};

const DOC_DIR = (FileSystem as any).documentDirectory as string | null;
const CACHE_DIR = (FileSystem as any).cacheDirectory as string | null;
const BASE_DIR = DOC_DIR ?? CACHE_DIR ?? null;

export const RECORDINGS_DIR = BASE_DIR ? `${BASE_DIR}recordings/` : null;

export async function ensureRecordingsDir() {
  if (!RECORDINGS_DIR) {
    throw new Error("No base directory available for recordings");
  }

  const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, {
      intermediates: true,
    });
  }
}

export function sanitizeRecordingName(input: string) {
  return input
    .replace(/[/\\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9 _.-]/g, "")
    .trim()
    .replace(/^\.+/, "");
}

export function extractExtension(uri: string) {
  const extMatch = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return extMatch?.[1] ?? "m4a";
}

export function normalizeTimestamp(value?: number) {
  if (!value) return undefined;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

export function formatDuration(seconds: number) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatMillis(totalMillis: number) {
  return formatDuration(Math.floor(totalMillis / 1000));
}

export function formatFileSize(size?: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatModifiedDate(timestamp?: number) {
  const normalized = normalizeTimestamp(timestamp);
  if (!normalized) return "No date";

  const date = new Date(normalized);
  const day = date.toLocaleDateString();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${day} ${time}`;
}
