# Logcat Viewer

A standalone Android **logcat** viewer that mimics Android Studio's Logcat
panel — single HTML file, zero dependencies, works offline. Open a capture
file, paste logs, or stream live from a connected device via a tiny Node
bridge.

## Features

- **Single-file UI** — `logcat.html` is plain HTML/CSS/JS, no frameworks,
  no bundler, no network required.
- **Auto-detects** multiple `adb logcat -v` formats: `threadtime`, `time`,
  `brief`, `tag`, ISO-timestamp threadtime, and raw.
- **Live streaming** from any `adb`-reachable device via Server-Sent Events.
- **Android-Studio-style filtering** — tokens like `tag:`, `package:`,
  `pid:`, `level:`, `min:`, regex `~:` / `/slashes/`, negation with `-`,
  quoted phrases.
- **Level pills**, minimum-level selector, column show/hide, soft wrap,
  light/dark theme.
- **Export / Copy** the currently filtered view.
- **Drop-zone** — drag a logcat file anywhere on the page.
- **In-app docs** — the `📘 Docs` toolbar button renders this README in a
  modal when the bridge is running.

## Quick start

### macOS / Linux

```bash
./start.sh                # bridge on :8037, opens http://localhost:8037/
./start.sh --port 9000    # custom port
ADB=/path/to/adb ./start.sh
```

### Windows (cmd.exe or PowerShell)

```bat
start.cmd                 :: default port 8037
start.cmd --port 9000     :: custom port
set ADB=C:\platform-tools\adb.exe && start.cmd
```

### File-only mode (no device streaming)

Just open `logcat.html` in a browser. You can load files, paste, use the
sample, and filter — everything except live streaming works offline.

## Requirements

- **Node.js 18+** — for `adb-bridge.js` (live streaming only).
- **Android platform-tools (`adb`)** — also only needed for live streaming.
  If `adb` is missing, the launcher auto-downloads Google's official zip
  into `./platform-tools/` (no admin, no package manager). Unix needs
  `curl` (or `wget`) + `unzip`; Windows uses PowerShell built-ins.

Nothing is required for the file-viewer mode — `logcat.html` is fully
self-contained.

## Capturing logs

```bash
adb logcat -v threadtime > my.log        # dump current buffer
adb logcat -v threadtime -b all > my.log # all buffers
adb logcat -d -v threadtime > my.log     # dump and exit (don't follow)
```

Then open `my.log` in the viewer. Other `-v` formats (`time`, `brief`,
`tag`) are also auto-detected.

## Filter / query syntax

Tokens combine with **AND**. Prefix with `-` to exclude.

| Token                             | Meaning                                     |
| --------------------------------- | ------------------------------------------- |
| `tag:MyTag`                       | Substring match on tag                      |
| `tag~:^MyTag$`                    | Regex match on tag                          |
| `package:com.example` / `pkg:`    | Match package / UID column                  |
| `pid:1234`, `tid:5678`            | Process / thread id                         |
| `level:W` or `level:warn`         | Exact level                                 |
| `min:I`                           | Minimum level (V < D < I < W < E < A)       |
| `message:"hello world"` / `msg:`  | Quoted phrase in message                    |
| `"exact phrase"`                  | Phrase match across any field               |
| `/regex/`                         | Body regex (also works when `.*` is toggled)|
| `-tag:Choreographer`              | Negate any token                            |

The `.*` / `Aa` / `⟨w⟩` / `!` toolbar toggles apply regex / case /
whole-word / invert-match to the free-text part of the query.

## Live streaming

1. Run `./start.sh` (or `start.cmd`). The bridge listens on
   `http://localhost:8037/` and the page auto-detects it.
2. Connect your device over USB with USB debugging enabled (or use
   `adb connect <host>:<port>` for TCP/IP).
3. Pick the device from the dropdown, choose a buffer (`main` /
   `system` / `crash` / `events` / `radio` / `all`) and a format, then
   hit **▶ Start**.
4. Type a filter live — the view updates as lines arrive.
5. **🗑 Device** clears the device-side buffer (`adb logcat -c`).
   **■ Stop** ends the SSE stream.

## Keyboard shortcuts

| Keys                           | Action                       |
| ------------------------------ | ---------------------------- |
| <kbd>Cmd/Ctrl + O</kbd>        | Open file                    |
| <kbd>Cmd/Ctrl + F</kbd>        | Focus filter box             |
| <kbd>Cmd/Ctrl + L</kbd>        | Clear logs                   |
| <kbd>Cmd/Ctrl + End</kbd>      | Jump to bottom               |
| <kbd>Esc</kbd>                 | Clear filter                 |

## Configuration

Environment variables picked up by the launchers / bridge:

- `PORT` — bridge listen port (default `8037`).
- `ADB`  — path to the `adb` binary. Launcher resolution order:
  `$ADB` → `./platform-tools/adb[.exe]` → system `PATH` → auto-install.

CLI flags for `adb-bridge.js`:

- `--port <n>` — same as `PORT=n`.
- `--adb <path>` — same as `ADB=<path>`.

## Troubleshooting

- **"adb not found"** — let the launcher auto-install, or set
  `ADB=/full/path/to/adb`. On Linux some distros ship it as
  `android-tools-adb`.
- **Device not listed** — run `adb devices`; authorize the RSA prompt on
  the phone; re-plug the cable; try `adb kill-server && adb start-server`.
- **Bridge says "live offline"** — make sure the page is loaded from
  `http://localhost:8037/`, not as a `file://` URL, to avoid private-
  network / CORS prompts.
- **Huge logs feel sluggish** — the UI caps live-stream memory at 200k
  entries and trims oldest rows from the DOM; for file loads, use the
  `min:I` token to reduce what renders.

## Security notes

The bridge binds to `127.0.0.1` only and never exposes itself to other
hosts. It does shell out to `adb`, so don't point it at a modified
binary you don't trust. Don't change the bind address.

## Project layout

| File             | Role                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `logcat.html`    | Self-contained viewer UI.                                            |
| `adb-bridge.js`  | Node server: serves the HTML, `/devices`, `/stream` (SSE), `/clear`. |
| `start.sh`       | macOS / Linux launcher (also auto-installs `adb` if missing).        |
| `start.cmd`      | Windows launcher (same behaviour).                                   |
| `README.md`      | This file — user-facing docs.                                        |
| `AGENT.md`       | Guidance for AI coding agents working on the repo.                   |
