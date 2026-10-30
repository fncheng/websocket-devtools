# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebSocket DevTools is a Chrome/Edge Manifest V3 extension that monitors, simulates, and
blocks WebSocket traffic. It ships a DevTools panel plus a background service worker that
keeps monitoring connections even when the panel is closed. UI is React 19 + Mantine 8;
the build is Vite via `vite-plugin-web-extension`.

## Commands

```bash
pnpm install            # install deps (packageManager: pnpm@10.5.2, Node ^20.19.0 || >=22.12.0)
pnpm dev                # regenerate locales + vite build --watch (development, unminified, sourcemaps)
pnpm build              # clean + regenerate locales + production build → dist/
pnpm build:dev          # one-off development build (no watch)
pnpm i18n               # regenerate Chrome _locales from src/assets/locales (run before any build)
pnpm clean              # rm -rf dist
```

Run `pnpm test` (`node --test`) for the unit suite; no linter is configured. For manual
verification, load the unpacked extension from `dist/` in `chrome://extensions` (Developer
mode). Avoid build commands unless the user asks.

## Architecture: the four-layer message pipeline

The core of this codebase is a message relay across four isolated JavaScript contexts.
Understanding this flow is essential before touching any messaging code.

```
Page context          Content script        Service worker         DevTools panel
injected.js    <-->   content.js     <-->   background.js   <-->   panel.jsx
  (hooks WS)          (bridge)              (store + route)        (React UI)
```

1. **`src/content/injected.js`** (runs in the page's own context, ~1400 lines).
   Replaces `window.WebSocket` with a `ProxiedWebSocket` that intercepts every
   `send`/`onmessage`/open/close/error. It also handles binary/base64/hex/protobuf
   detection and preview truncation (`MAX_PREVIEW_SIZE` = 100KB), event **batching**
   (`BATCH_SIZE_THRESHOLD`, `flushBatchQueue`), and a **circuit breaker** that stops
   monitoring under high traffic and emits `circuit-breaker-triggered`. Communicates only
   via `window.postMessage` with `source: "websocket-proxy-injected"` (inbound commands
   arrive as `source: "websocket-proxy-content"`).

2. **`src/content/content.js`** (content script, `run_at: document_start`, `all_frames`).
   Injects `injected.js` as an external script (CSP-safe), then bridges `window.postMessage`
   <-> `chrome.runtime` messaging. Adds frame-aware message IDs for dedup across iframes.
   Gated by the `websocket-proxy-enabled` storage flag.

3. **`src/background/background.js`** (MV3 service worker).
   Central store (`websocketData.connections`) and router. Maintains a `devtoolsPorts`
   Map of `port -> tabId` so events are routed to the correct DevTools panel. Runs a
   20s keep-alive to prevent the service worker from being killed while a panel is
   connected. Serves `get-existing-data` for panels that open after connections exist.

4. **`src/devtools/panel.jsx`** (React app, ~800 lines).
   Connects to background via `chrome.runtime.connect({ name: "devtools" })` and sends
   `{ type: "init", tabId }`. Applies its own client-side caps: `MAX_MESSAGES_PER_CONNECTION`
   (5000), `MAX_TOTAL_MESSAGES` (20000), `MAX_PROCESSED_IDS` (50000). Holds a
   `connectionsMap` and a `processedMessageIds` Set for dedup.

`src/devtools/devtools.js` only creates the panel (also gated by `websocket-proxy-enabled`).

### Message types (the wire protocol)

All cross-layer communication is `{ type, ... }` objects. Key types by direction:

- Events up (page → panel): `connection`, `message`, `close`, `error`,
  `websocket-event` / `websocket-event-batch`, `circuit-breaker-triggered`.
- Commands down (panel → page): `simulate-message`, `simulate-system-event`,
  `block-incoming`, `block-outgoing`, `create-manual-websocket`, `ignore-connection`.
- Control: `init`, `get-existing-data`, `start-monitoring`, `stop-monitoring`,
  `proxy-state-change`, `keep-alive` / `keep-alive-ack`, `resume-traffic-monitoring`.

When adding a feature that crosses contexts, add the type handler in ALL relevant layers
along the pipeline — a new command needs handling in panel → background → content → injected.

## UI structure

- `src/components/` — panel building blocks: `ControlPanel`, `WebSocketList`,
  `MessageDetails`, `SimulateMessagePanel` / `SimulateEditorTab` (CodeMirror JSON editor),
  `FloatingSimulate` (draggable via `react-rnd`), `FavoritesTab`, `SystemEventsTab`,
  `JsonViewer`, `ManualConnectModal`, `LanguageSelector`.
- `src/hooks/` — panel behavior composables (`usePanelManager`, `useAutoResize`,
  `useWindowAnimation`, `useWindowConstraints`, message-highlight hooks).
- `src/styles/` — plain CSS per component with `variables.css` design tokens.
- `src/popup/popup.jsx` — toolbar popup (enable/disable toggle).

## State & persistence

Persistence is browser-local only (no servers). Services in `src/utils/` wrap
`localStorage` with a listener/subscription pattern:
- `favoritesService.js` (`websocket-favorites`, debounced batch updates) + `globalFavorites.js`.
- `wsHistoryService.js` (`websocket-connection-history`, capped at 3 records).
- The extension-enabled flag lives in `chrome.storage.local` under `websocket-proxy-enabled`.

## Internationalization (dual system)

`src/utils/i18n.js` is a hybrid system: it prefers the Chrome i18n API but falls back to a
custom runtime switcher when the user manually changes language. Source of truth is the flat
JSON in `src/assets/locales/*.json`. `pnpm i18n` (`scripts/generate-chrome-locales.js` +
`i18n-converter.js`) converts these into Chrome's nested `_locales/<lang>/messages.json`
format (keys flattened: `app.title` → `app_title`). **Always run `pnpm i18n` after editing
locale files**; it runs automatically inside `dev`/`build`. Supported: en, zh-cn, zh-tw, ja, ko, de, fr.

## Conventions

- Codebase is JavaScript/JSX (not TypeScript) with ES modules; all code comments are in English.
- `vite.config.js` declares extra entry points (`injected.js`, `panel.html`, `popup.html`)
  and static-copies `icons/`, `src/_locales/`, and `src/utils/` into `dist/`. Update these
  `additionalInputs` / `viteStaticCopy` targets when adding new HTML entry points or
  runtime-fetched assets.
- The manifest requests minimal permissions (`activeTab`, `storage`) with broad
  `host_permissions` for `http(s)://*/*` so the proxy can hook any page's WebSocket.
