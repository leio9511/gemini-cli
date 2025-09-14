#!/bin/bash

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

if [ -n "$1" ]; then
  cd "$1"
fi


source "$(dirname "$0")/../utils.sh"


# Early exit for stale sessions to prevent unintended operations.
if [ -f "ORCHESTRATION_STATE.json" ] && [ ! -f "ACTIVE_PR.json" ]; then
  status=$(jq -r .status ORCHESTRATION_STATE.json)
  if [ "$status" != "HALTED" ]; then
    rm ORCHESTRATION_STATE.json
    echo "Stale session cleaned. Please start again."
    exit 0
  fi
fi

status=$(jq -r .status ORCHESTRATION_STATE.json || echo "null")

if [ "$status" == "FINALIZE_COMPLETE" ]; then
    master_plan_path=$(jq -r '.masterPlanPath' ACTIVE_PR.json)
    last_commit_hash=$(read_state "last_commit_hash")
    echo "Update the master plan at ${master_plan_path} to mark this PR as [DONE] and append the final commit hash: ${last_commit_hash}."
    exit 0
fi

if [ "$status" == "PLAN_UPDATED" ]; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    branch_name=$(jq -r '.prTitle' ACTIVE_PR.json | sed 's/ /-/g' | tr '[:upper:]' '[:lower:]')
    git checkout main && git pull && git merge --no-ff "feature/$branch_name" && git branch -d "feature/$branch_name"
    if [ $? -ne 0 ]; then
      write_state "status" "HALTED"
      echo "Merge conflict"
      exit 1
    fi
    rm ACTIVE_PR.json
    write_state "status" "INITIALIZING"
    release_lock
    trap - EXIT INT TERM
    echo "Branch merged and deleted. Ready for next PR."
    exit 0
fi








MAX_DEBUG_ATTEMPTS=3

read -r -d '' INITIALIZATION_INSTRUCTION <<'EOF'
Please read the plan file and select the next pull request to implement.

First, you must read the plan file and select the next pull request to implement.

Once you have identified the pull request, you must create a new file called \`ACTIVE_PR.json\` that contains the title, summary, and implementation tasks for the pull request.

The \`ACTIVE_PR.json\` file should be in the following format:

{
  "masterPlanPath": "string",
  "prTitle": "string",
  "summary": "string",
  "verificationPlan": "string",
  "tasks": [
    {
      "taskName": "string",
      "status": "TODO | IN_PROGRESS | DONE | ERROR",
      "tdd_steps": [
        {
          "type": "RED | GREEN | REFACTOR",
          "description": "string",
          "status": "TODO | DONE",
        },
      ],
    },
  ],
}
EOF

if [ "$status" == "REPLANNING" ]; then
    echo "Please provide an updated ACTIVE_PR.json file."
    exit 0
fi

if [ -f "ACTIVE_PR.json" ]; then
  # If all tasks are done, this is a stale session.
  if ! jq -e '.tasks[] | select(.status!="DONE")' ACTIVE_PR.json > /dev/null; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "CODE_REVIEW"
    release_lock
    trap - EXIT INT TERM
    rm ACTIVE_PR.json
    echo "All tasks are complete. Requesting code review."
    exit 0
  fi
fi




# If in a debugging state, provide the error log and strategic guidance.
if [ "$status" == "HALTED" ]; then
  echo "Halting operation."
  exit 1
fi

if [ "$status" == "DEBUGGING" ]; then
  debug_attempt_counter=$(read_state "debug_attempt_counter")
  error_log=$(cat error.log)
  HYPOTHESIZE_MAX_ATTEMPTS=2
  INSTRUMENTATION_MAX_ATTEMPTS=5

  echo "A test failed unexpectedly. You are now in a debugging state."
  echo "Last error:"
  echo "$(read_state "last_error")"
  echo ""
  echo "Your task is to:"
  echo "1. Hypothesize about the cause of the error."
  echo "2. Propose a fix."
  if [ "$debug_attempt_counter" -le "$HYPOTHESIZE_MAX_ATTEMPTS" ]; then
    echo "Hypothesize & Fix."
  elif [ "$debug_attempt_counter" -le "$INSTRUMENTATION_MAX_ATTEMPTS" ]; then
    echo "Use Instrumentation."
  else
    echo "Conclude the task is too complex. You should consider using the 'request_scope_reduction' tool."
  fi
  exit 0
fi

# If no active PR file exists, the first step is to create one.
if [ ! -f "ACTIVE_PR.json" ]; then
  echo "{}" | jq '.status = "INITIALIZING"' > ORCHESTRATION_STATE.json
  echo "$INITIALIZATION_INSTRUCTION"
  exit 0
fi

if [ "$status" == "CODE_REVIEW" ] && [ -f "FINDINGS.json" ] && [ "$(jq 'length' FINDINGS.json)" -eq 0 ]; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "AWAITING_FINALIZATION"
    release_lock
    trap - EXIT INT TERM
    echo "All tasks are complete. Squash your commits into a single commit using the PR title from ACTIVE_PR.json as the message."
    exit 0
fi

if [ "$status" == "AWAITING_FINALIZATION" ] && [ -n "$(read_state "last_commit_hash")" ]; then
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "FINALIZE_COMPLETE"
    release_lock
    trap - EXIT INT TERM
    master_plan_path=$(jq -r '.masterPlanPath' ACTIVE_PR.json)
    echo "Update the master plan at ${master_plan_path} to mark this PR as [DONE] and append the final commit hash."
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
    task_description=$(jq -r '(.tasks[] | select(.status=="TODO") | .tdd_steps[] | select(.status=="TODO")).description' ACTIVE_PR.json | head -n 1)
    echo "Your goal is to complete the next TDD step: ${task_description}"
    exit 0
    ;;
  "false")
    acquire_lock
    trap 'release_lock' EXIT INT TERM
    write_state "status" "CODE_REVIEW"
    release_lock
    trap - EXIT INT TERM
    echo "All tasks are complete. Requesting code review."
    exit 0
    ;;
esac
