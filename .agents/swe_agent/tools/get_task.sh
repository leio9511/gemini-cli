#!/bin/bash
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

if [ -n "$1" ]; then
  cd "$1"
fi

source "$SCRIPT_DIR/../utils.sh"



MAX_DEBUG_ATTEMPTS=3

INITIALIZATION_INSTRUCTION="Your mission is to create a pull request that implements the plan.

First, you must read the plan file and select the next pull request to implement.

Once you have identified the pull request, you must create a new file called \`ACTIVE_PR.json\` that contains the title, summary, and implementation tasks for the pull request.

The \`ACTIVE_PR.json\` file should be in the following format:
..."

# If no active PR file exists, the first step is to create one.
if [ ! -f "ACTIVE_PR.json" ]; then
  echo "$INITIALIZATION_INSTRUCTION"
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
  HYPOTHESIZE_MAX_ATTEMPTS=2
  INSTRUMENTATION_MAX_ATTEMPTS=5

  echo "DEBUGGING"
  echo "Error log:"
  echo "$error_log"
  echo "Strategic guidance:"
  if [ "$debug_attempt_counter" -le "$HYPOTHESIZE_MAX_ATTEMPTS" ]; then
    echo "Hypothesize & Fix."
  elif [ "$debug_attempt_counter" -le "$INSTRUMENTATION_MAX_ATTEMPTS" ]; then
    echo "Use Instrumentation."
  else
    echo "Conclude the task is too complex. You should consider using the 'request_scope_reduction' tool."
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

last_completed_step=$(read_state "last_completed_step")
if [ "$last_completed_step" == "GREEN" ] || [ "$last_completed_step" == "REFACTOR" ]; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "last_completed_step" "" # Clear the last completed step
    release_lock
    trap - EXIT INT TERM
    echo "You have just completed a TDD step. This is a good time to create a safety checkpoint commit."
    exit 0
fi

# Check for the next task to execute.
has_todo_tasks=$(jq -e '.tasks[] | select(.status=="TODO")' ACTIVE_PR.json > /dev/null && echo "true" || echo "false")

case "$has_todo_tasks" in
  "true")
    task_description=$(jq -r '(.tasks[] | select(.status=="TODO")).description' ACTIVE_PR.json | head -n 1)
    echo "Your goal is to complete the next TDD step: ${task_description}"
    exit 0
    ;;
  "false")
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "CODE_REVIEW"
    release_lock
    trap - EXIT INT TERM
    echo "REQUEST_REVIEW"
    exit 0
    ;;
esac






