#!/usr/bin/env bash
# Launches the adb-bridge for the Logcat Viewer.
#   ./start.sh              # default port 8037
#   ./start.sh --port 9000  # custom port
#   ADB=/path/to/adb ./start.sh
#
# If `adb` is not found, downloads Google's official platform-tools zip
# into ./platform-tools/ and uses that. No sudo / package manager required.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ node not found on PATH. Install Node.js 18+ from https://nodejs.org/ and retry." >&2
  exit 1
fi

install_platform_tools() {
  local pt_os
  case "$(uname -s)" in
    Darwin) pt_os=darwin ;;
    Linux)  pt_os=linux ;;
    *) echo "✗ Auto-install unsupported on $(uname -s). Install Android platform-tools manually." >&2; return 1 ;;
  esac

  if ! command -v unzip >/dev/null 2>&1; then
    echo "✗ 'unzip' is required to auto-install platform-tools. Install it and retry." >&2
    return 1
  fi

  local url="https://dl.google.com/android/repository/platform-tools-latest-${pt_os}.zip"
  local tmp; tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN

  echo "  ▸  downloading $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar "$url" -o "$tmp/pt.zip"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$tmp/pt.zip" "$url"
  else
    echo "✗ Need curl or wget to download platform-tools." >&2
    return 1
  fi

  echo "  ▸  extracting into ./platform-tools/"
  unzip -q -o "$tmp/pt.zip" -d .
}

# Resolve adb: explicit $ADB > local ./platform-tools > system PATH > auto-install
ADB_BIN=""
if [ -n "${ADB:-}" ]; then
  ADB_BIN="$ADB"
elif [ -x "./platform-tools/adb" ]; then
  ADB_BIN="$PWD/platform-tools/adb"
elif command -v adb >/dev/null 2>&1; then
  ADB_BIN="adb"
fi

if [ -z "$ADB_BIN" ]; then
  echo "⚠  adb not found — installing Android platform-tools locally..."
  if install_platform_tools; then
    ADB_BIN="$PWD/platform-tools/adb"
    echo "  ▸  adb ready at $ADB_BIN"
  else
    echo "   bridge will start anyway; device listing will fail until adb is available." >&2
    ADB_BIN="adb"
  fi
fi

export ADB="$ADB_BIN"

PORT="${PORT:-8037}"
URL="http://localhost:${PORT}/"

# Try to open the viewer in the default browser once the server is up.
( sleep 1
  if   command -v open       >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open   >/dev/null 2>&1; then xdg-open "$URL"
  elif command -v start      >/dev/null 2>&1; then start "$URL"
  fi
) &

exec node adb-bridge.js "$@"
