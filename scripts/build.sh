#!/usr/bin/env bash
# Build guide/index.html (the original one-page guide) from the artifact source (which has no document skeleton).
# Usage: scripts/build.sh [path/to/piano-guide.html]
set -euo pipefail
SRC="${1:-src/piano-guide.html}"
cd "$(dirname "$0")/.."
{
  printf '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  cat "$SRC"
  printf '\n</html>\n'
} > guide/index.html
echo "built guide/index.html from $SRC"
