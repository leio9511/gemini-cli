#!/bin/bash
set -e
set -x

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

if [ -n "$1" ]; then
  cd "$1"
fi

source "$SCRIPT_DIR/../utils.sh"

MAX_DEBUG_ATTEMPTS=3


# If ACTIVE_PR.json exists, check if it's a stale session (all tasks are DONE).
if [ -f "ACTIVE_PR.json" ]; then
    :
fi

# If no active PR file exists, the first step is to create one.
if [ ! -f "ACTIVE_PR.json" ]; then
  echo "CREATE_PR"
  exit 0
fi

# Ensure the state file is initialized if it doesn't exist.
acquire_lock
trap 'release_lock' EXIT INT TERM
if [ ! -f "ORCHESTRATION_STATE.json" ]; then
    write_state "status" "INITIALIZING"
fi
release_lock
trap - EXIT INT TERM

# If in a debugging state, provide the error log and strategic guidance.
status=$(read_state "status")
if [ "$status" == "DEBUGGING" ]; then
  debug_attempt_counter=$(read_state "debug_attempt_counter")
  error_log=$(cat error.log)
  echo "DEBUGGING"
  echo "Error log:"
  echo "$error_log"
  echo "Strategic guidance:"
  if [ "$debug_attempt_counter" -lt "$MAX_DEBUG_ATTEMPTS" ]; then
    echo "You have made $debug_attempt_counter debugging attempts. You can request scope reduction after $MAX_DEBUG_ATTEMPTS attempts."
  fi
fi

if [ "$status" == "CODE_REVIEW" ] && [ -f "FINDINGS.json" ] && [ "$(jq 'length' FINDINGS.json)" -eq 0 ]; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "AWAITING_FINALIZATION"
    release_lock
    trap - EXIT INT TERM
    echo "Code review approved. Please squash your commits and submit the final commit hash."
    exit 0
fi

if [ "$status" == "AWAITING_FINALIZATION" ] && [ -n "$(read_state "last_commit_hash")" ]; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "FINALIZE_COMPLETE"
    release_lock
    trap - EXIT INT TERM
    echo "Please update the master plan."
    exit 0
fi

# Check for the next task to execute.
if jq -e '.tasks[] | select(.status=="TODO")' ACTIVE_PR.json > /dev/null; then
  echo "EXECUTE_TASK"
  exit 0
fi

# If all tasks are done, transition to the code review state.
if ! jq -e '.tasks[] | select(.status!="DONE")' ACTIVE_PR.json > /dev/null; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "CODE_REVIEW"
    release_lock
    trap - EXIT INT TERM
    echo "REQUEST_REVIEW"
    exit 0
fi

echo "Error: Unhandled state in get_task.sh" >&2
exit 1
