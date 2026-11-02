#!/usr/bin/env bash
# Servidor local: http://localhost:8080
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/build.sh
cd _site && python3 -m http.server "${PORT:-8080}"
