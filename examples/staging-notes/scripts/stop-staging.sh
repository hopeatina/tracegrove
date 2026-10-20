#!/usr/bin/env bash
set -uo pipefail
state="${1:-$(cd "$(dirname "$0")/.." && pwd)/.staging}"
for pid in "$state"/*.pid; do [ -f "$pid" ] && kill "$(cat "$pid")" 2>/dev/null; rm -f "$pid"; done
echo stopped
