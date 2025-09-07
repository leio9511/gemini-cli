#!/bin/bash
set -e

LOCK_DIR="ORCHESTRATION_STATE.lock"

# Acquires a lock by creating a directory.
# Loops until the lock is acquired.
acquire_lock() {
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    sleep 0.1
  done
}

# Releases the lock.
release_lock() {
  rmdir "$LOCK_DIR"
}

# Reads a value from the state file.
read_state() {
  if [ -f "ORCHESTRATION_STATE.json" ]; then
    jq -r ".$1" ORCHESTRATION_STATE.json
  fi
}

# Writes a value to the state file.
# IMPORTANT: This function assumes a lock has already been acquired
# by the calling script. It does NOT handle locking itself.
write_state() {
  local tmp_file=$(mktemp)
  # Ensure temp file is removed on exit
  trap 'rm -f "$tmp_file"' EXIT INT TERM

  # Set initial content if the state file doesn't exist
  if [ ! -f "ORCHESTRATION_STATE.json" ]; then
    echo "{}" > ORCHESTRATION_STATE.json
  fi

  if jq ".$1 = \"$2\"" ORCHESTRATION_STATE.json > "$tmp_file"; then
    mv "$tmp_file" ORCHESTRATION_STATE.json
  else
    echo "Error: jq command failed while writing state." >&2
    # The trap will clean up the temp file.
    exit 1
  fi
  # Clean up the trap
  trap - EXIT INT TERM
}
