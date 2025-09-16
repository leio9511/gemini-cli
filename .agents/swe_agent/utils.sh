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
  # Get the path to the first TODO step
  path_to_step=$(jq -r '
    first(
      .tasks | to_entries | .[] | select(.value.status == "TODO") |
      .key as $task_idx | .value.tdd_steps | to_entries | .[] | select(.value.status == "TODO") |
      "\(.key)"
    )
  ' ACTIVE_PR.json)

  # Get the path to the first TODO task
  path_to_task=$(jq -r '
    first(
      .tasks | to_entries | .[] | select(.value.status == "TODO") |
      "\(.key)"
    )
  ' ACTIVE_PR.json)

  # Update the status of that step to "DONE"
  jq --argjson task_idx "$path_to_task" --argjson step_idx "$path_to_step" '
    .tasks[$task_idx].tdd_steps[$step_idx].status = "DONE"
  ' ACTIVE_PR.json > tmp.json && mv tmp.json ACTIVE_PR.json
}

mark_current_task_done() {
  task_index=$(jq '.tasks | to_entries | .[] | select(.value.status == "TODO") | .key' ACTIVE_PR.json)
  jq --argjson ti "$task_index" '.tasks[$ti].status = "DONE"' ACTIVE_PR.json > tmp.json && mv tmp.json ACTIVE_PR.json
}

read_config_value() {
  local key=$1
  local config_file="$SCRIPT_DIR/../swe_agent_config.json"

  if [ -f "$config_file" ]; then
    jq -r ".$key" "$config_file"
  fi
}

