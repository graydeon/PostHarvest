#!/usr/bin/env bash
# Usage: ./build.sh [firefox|chrome]
# Copies the appropriate manifest to manifest.json for loading in the browser.
set -e

BROWSER="${1:-firefox}"
DIR="$(cd "$(dirname "$0")" && pwd)"

case "$BROWSER" in
  firefox)
    cp "$DIR/manifest.firefox.json" "$DIR/manifest.json"
    echo "Manifest set for Firefox. Load via about:debugging → Load Temporary Add-on → select manifest.json"
    ;;
  chrome)
    cp "$DIR/manifest.chrome.json" "$DIR/manifest.json"
    echo "Manifest set for Chrome/Edge. Load via chrome://extensions → Developer mode → Load unpacked → select extension/"
    ;;
  *)
    echo "Usage: $0 [firefox|chrome]"
    exit 1
    ;;
esac
