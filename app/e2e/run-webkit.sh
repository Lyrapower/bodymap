#!/usr/bin/env bash
# Runs e2e/d0.webkit.mjs inside a phone-sized X screen with a window manager (needed for full-screen).
# Usage: e2e/run-webkit.sh [390x844] [full|layout|d1]
set -u
VIEW="${1:-390x844}"; MODE="${2:-full}"
D=":$((90 + RANDOM % 9))"
Xvfb "$D" -screen 0 "${VIEW}x24" -nolisten tcp >/dev/null 2>&1 &
XPID=$!
sleep 0.5
DISPLAY="$D" matchbox-window-manager -use_titlebar no >/dev/null 2>&1 &
WPID=$!
sleep 0.3
# MODE: full | layout -> d0.webkit.mjs ; d1 -> d1.webkit.mjs (records, forms, exports, backup)
SCRIPT=d0.webkit.mjs; [ "$MODE" = "d1" ] && SCRIPT=d1.webkit.mjs
DISPLAY="$D" VIEW="$VIEW" MODE="$MODE" node "$(dirname "$0")/$SCRIPT"
CODE=$?
kill $WPID $XPID 2>/dev/null
exit $CODE
