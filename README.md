<img src="https://socialify.git.ci/SineMag/Audio-Recorder/image?language=1&owner=1&name=1&stargazers=1&theme=Light" alt="Audio-Recorder" width="640" height="320" />

# Audio Recorder (Expo)

Voice recorder with local, per-device storage (no cross-device sharing), playback, rename, delete, search, and per-file metadata. Recording is disabled on web (Expo limitation), but the web build can showcase the UI/list.

### Live App
[Audio Recorder](https://audio-recorder-pvok.onrender.com)

## Stack

- Expo 54 (Router)
- React Native 0.81
- Expo AV / Audio
- Expo File System (legacy API for compatibility with Expo Go)

## Prerequisites

- Node 18+ and npm
- Expo CLI (`npm i -g expo` optional; `npx expo` works without global install)
- Android emulator or iOS simulator, or a real device with Expo Go

## Clone

```bash
git clone https://github.com/SineMag/Audio-Recorder.git
cd Audio-Recorder
```

## Install & run (development)

```bash
npm install
npx expo start
```

Then in the Metro UI / terminal, choose:

- `i` to open iOS simulator (macOS)
- `a` to open Android emulator
- Scan the QR with Expo Go on device

## Project structure

```
Audio-Recorder/
  app/
    (tabs)/
      index.tsx        # Record screen (record, pause, save, playback preview)
      play.tsx         # List, search, rename, delete, play recordings
      _layout.tsx      # Tab layout
    _layout.tsx        # Root navigation
  assets/              # App icons and images
  components/          # UI components
  constants/           # Theme/constants
  hooks/               # Custom hooks
  app.json             # Expo config (permissions)
  package.json         # Scripts and dependencies
  README.md
```

## Web (UI demo only; recording not supported on web)

- Start: `npm run web`
- Export static site: `npm run export:web` (outputs to `dist/`)

## Deploy to Render (static web demo)

This repo includes [`render.yaml`](/c:/Users/Trainee/Audio-Recorder/render.yaml), so Render can pick up the correct static-site settings automatically.

Manual Render settings:

- Runtime: `Static Site`
- Build command: `npm ci && npm run export:web`
- Publish directory: `dist`
- Rewrite rule: `/* -> /index.html`

Deploy steps:

1. Push this repo to GitHub.
2. In Render, click `New +` -> `Static Site`.
3. Connect the GitHub repo and let Render read `render.yaml`, or enter the manual settings above.
4. Deploy the site.
5. Copy the generated Render URL and replace the `Live site:` placeholder near the top of this README.

Note: Recording is not available on web; the Render deployment is for the public UI/demo build.

## Permissions / storage

- Microphone permission is requested at runtime (mobile only).
- Recordings are stored per-device in the sandboxed document/cache directory; other devices cannot see your files.

## Key features

- Record / pause / resume / stop with elapsed timer.
- Save to local storage; per-device isolation.
- Playback with position/duration display, play/pause toggle.
- Rename (sanitized), delete, and search recordings.
- Show size and modification date/time; newest-first listing.

## Troubleshooting

- If you see FS deprecation warnings, we intentionally import `expo-file-system/legacy` for compatibility with Expo Go.
- If you see "Failed to save recording", check Metro console for the logged error and ensure you're on device/emulator (not web) and have granted mic permission.

## Scripts

- `npm start` / `npx expo start` - start Metro
- `npm run android` - run on Android emulator/device
- `npm run ios` - run on iOS simulator (macOS)
- `npm run web` - start web dev server (UI only)
- `npm run export:web` - export static web build to `dist/`
- `npm run lint` - lint
