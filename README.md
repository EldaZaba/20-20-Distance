# 20-20 Distance

Desktop tray app built with Tauri + React that reminds you to follow the 20-20 eye rule:

- Every interval, look 20 meters away
- For 20 seconds

The app runs in the system tray, shows a fullscreen break overlay, tracks progress stats, and supports custom reminder sound.

## Features

- Tray-first workflow (runs in background)
- Configurable reminder interval (`1, 10, 20, 30, 45, 60` minutes)
- Fullscreen 20-second overlay break
- Desktop notifications
- Optional sound reminders
- Custom `alert.wav` support from `sounds/`
- Basic motion detection status from webcam during overlay
- Daily stats (`streak`, `points`, `sessions`)
- Auto-start enabled on desktop

## Tech Stack

- Frontend: React + TypeScript + Vite
- UI: MUI + Tailwind CSS
- Desktop runtime: Tauri v2 (Rust backend)

## Requirements

- Node.js 18+
- npm
- Rust toolchain (`stable`)
- Tauri system prerequisites for your OS (WebView2 on Windows, etc.)

## Quick Start

```bash
npm install
npm run tauri dev
```

This starts Vite and the Tauri desktop app.

## Build

Frontend build:

```bash
npm run build
```

Desktop bundle:

```bash
npm run tauri build
```

## Custom Sound

1. Put a `.wav` file in `sounds/`.
2. Preferred filename is `alert.wav`.
3. If `alert.wav` is not present, the first `.wav` file is used.

## Permissions

- Notifications: used for break reminders.
- Camera: used only for motion-detection status during overlay.

If denied, the app still works, but those features are limited.

## Project Structure

```text
src/                  React app (overlay + settings UI)
src/components/       Main UI components
src/lib/              Settings, timer, and stats helpers
src-tauri/src/main.rs Tauri backend (tray, timer loop, commands)
sounds/               Custom reminder audio files
```

## Notes

- Closing windows hides them instead of quitting the app.
- Use the tray menu to reopen settings or quit.

## License

MIT. See `LICENSE`.
