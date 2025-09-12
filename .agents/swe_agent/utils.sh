#!/bin/bash

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
    if jq -e ".$1" ORCHESTRATION_STATE.json > /dev/null; then
      jq -r ".$1" ORCHESTRATION_STATE.json
    else
      echo "null"
    fi
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

  # Check if the value is a number
  if [[ $2 =~ ^[0-9]+$ ]]; then
    jq_expr=".$1 = $2"
  else
    jq_expr=".$1 = \"$2\""
  fi

  if jq "$jq_expr" ORCHESTRATION_STATE.json > "$tmp_file"; then
    mv "$tmp_file" ORCHESTRATION_STATE.json
  else
    echo "Error: jq command failed while writing state." >&2
    # The trap will clean up the temp file.
    exit 1
  fi
  # Clean up the trap
  trap - EXIT INT TERM
}

mark_current_step_done() {
  task_index=$(jq 'map(.status == "TODO") | index(true)' <<< "$(jq -c '[.tasks[]]' ACTIVE_PR.json)")
  step_index=$(jq --argjson i "$task_index" '.[$i].tdd_steps | map(.status == "TODO") | index(true)' <<< "$(jq -c '.tasks' ACTIVE_PR.json)")

  jq --argjson ti "$task_index" --argjson si "$step_index" '.tasks[$ti].tdd_steps[$si].status = "DONE"' ACTIVE_PR.json > tmp.json && mv tmp.json ACTIVE_PR.json
}

