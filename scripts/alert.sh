#!/bin/bash
# Tribal Knowledge Alert — drums + popup + clipboard
# Usage: alert.sh <filename> <clipboard-message>

FILENAME="$1"
CLIPBOARD_MSG="$2"
SOUND="/System/Library/Sounds/Sosumi.aiff"

# Copy to clipboard first
echo "$CLIPBOARD_MSG" | pbcopy

# Start sound loop
(while true; do afplay "$SOUND"; done) &
LOOP_PID=$!

# Blocking popup
osascript \
  -e 'tell application "System Events" to activate' \
  -e "tell application \"System Events\" to display dialog \"New tribal knowledge processed:\n\n${FILENAME}\" with title \"Tribal Knowledge\" buttons {\"OK\"} default button \"OK\""

# Kill sound on dismiss
kill $LOOP_PID 2>/dev/null
killall afplay 2>/dev/null
