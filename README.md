# FaithCity Stageflow

FaithCity Stageflow is an original, offline-first desktop event timing and production-control application inspired by the workflow category of professional stage timers. It is not affiliated with or a copy of Stagetimer.

## Stack
- Electron
- React + TypeScript + Vite
- Zustand
- Node.js + Express
- Socket.IO/WebSockets
- SQLite via better-sqlite3
- Electron Builder

## Core architecture
The Electron main process owns the local database, local HTTP/WebSocket server, window lifecycle and secure preload IPC. The renderer is a React UI. LAN viewers connect directly to the local server and receive authoritative timer state; they calculate the live display from timestamps rather than decrementing a counter.

The reference workflow that motivated this architecture uses a controller, fullscreen viewer, agenda and moderator outputs, with WebSocket synchronization and timestamp-based local countdown behavior. FaithCity Stageflow implements its own versions of these concepts.

## Development
```bash
npm install
npm run dev
```

The first launch starts with an empty workspace—no sample room, timers, or messages are inserted. Create a room, then add timers from the controller or Timers page.

## Controller features
- Create and switch between persistent event rooms.
- Configure room defaults and per-timer warning and critical thresholds.
- Start, pause, reset, nudge, flash, and advance timers; SPACE, R, F, and N are controller shortcuts.
- Open the live viewer, agenda, and moderator output windows. Their device status reflects live Socket.IO connections.
- Send and clear presenter messages, synchronized to connected outputs.

## Build
```bash
npm run build
npm test
```

## Packaging
Build the platform you are running on:
```bash
npm run package:win
npm run package:mac
```
On Windows, `npm run package:win` creates an NSIS installer (`FaithCity-Stageflow-Setup-<version>-x64.exe`) and a portable executable (`FaithCity-Stageflow-Portable-<version>-x64.exe`) in `release/build/`. Give users the Setup file to install the app; it supports choosing an install directory and creates Start Menu and desktop shortcuts.
Cross-platform native packaging should be performed on the corresponding OS/CI runner when signing/notarization is required.

## LAN use
When FaithCity Stageflow launches, the local server binds to `0.0.0.0`. The controller shows the detected LAN address and port. A viewer device on the same network can use:

`http://LAN-IP:PORT/?mode=viewer&room=ROOM_ID`

The app does not need Internet access for its core runtime. If the operating-system firewall blocks incoming connections, allow the FaithCity Stageflow process/server on the private LAN.

## Offline validation
1. Start FaithCity Stageflow.
2. Create/select a room and add timers.
3. Start a timer and open a Viewer output.
4. Disable Internet while keeping LAN active.
5. Verify controller and viewer continue synchronizing.
6. Disconnect LAN and verify the controller still operates locally.
7. Restart and verify SQLite persistence.

## Scope
Timer rundown reordering, output layout customization, CSV/JSON import and export, crash-session recovery, backup and restore, user-configurable shortcuts, and native NDI output are not currently included.
