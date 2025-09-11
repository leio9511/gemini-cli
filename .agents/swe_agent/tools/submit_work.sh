#!/bin/bash

if ! command -v jq &> /dev/null
then
    echo "jq could not be found"
    exit 1
fi

if [ ! -f "ACTIVE_PR.json" ]; then
    echo "ACTIVE_PR.json not found"
    exit 1
fi


SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
source "$SCRIPT_DIR/../utils.sh"

handle_initializing_state() {
  if ! jq -e . ACTIVE_PR.json > /dev/null; then
    write_state "status" "HALTED"
    echo "Malformed ACTIVE_PR.json"
    exit 1
  fi
  branch_name=$(jq -r '.prTitle' ACTIVE_PR.json | sed 's/ /-/g' | tr '[:upper:]' '[:lower:]')
  write_state "status" "CREATING_BRANCH"
  echo "Please create a new branch named feature/$branch_name"
}

handle_code_review_state() {
  findings_file=$1
  if [ -f "$findings_file" ]; then
    # Create new tasks from findings
    jq -s '.[0] * {tasks: .[0].tasks + .[1]}' ACTIVE_PR.json "$findings_file" > tmp.json && mv tmp.json ACTIVE_PR.json
    write_state "status" "EXECUTING_TDD"
  fi
}


handle_awaiting_finalization_state() {
    commit_hash=$1
    # A squashed commit should have exactly one parent.
    parent_count=$(git rev-list --max-parents=1 "$commit_hash" | wc -l)
    if [ "$parent_count" == "1" ]; then
        write_state "last_commit_hash" "$commit_hash"
        echo "VERIFIED"
    fi
}

enter_debugging_state() {
  error_message=$1
  current_attempts=$(read_state "debug_attempt_counter" || echo 0)
  new_attempts=$((current_attempts + 1))
  write_state "status" "DEBUGGING"
  write_state "debug_attempt_counter" "$new_attempts"
  write_state "last_error" "$error_message"
}

handle_awaiting_analysis_state() {
  analysis_decision=$1
  if [ "$analysis_decision" == "SUCCESS" ]; then
    # Mark the current TDD step as DONE
    jq '(.tasks[] | .tdd_steps[] | select(.status=="TODO")).status = "DONE"' ACTIVE_PR.json > tmp.json && mv tmp.json ACTIVE_PR.json
    write_state "status" "EXECUTING_TDD"
  fi
}

status=$(read_state "status")

case "$status" in
  "INITIALIZING")
    handle_initializing_state
    ;;
  "CREATING_BRANCH")
    write_state "status" "EXECUTING_TDD"
    bash "$SCRIPT_DIR/get_task.sh"
    ;;
  "CODE_REVIEW")
    handle_code_review_state "$1"
    ;;
  "AWAITING_FINALIZATION")
    handle_awaiting_finalization_state "$2"
    exit 0
    ;;
  "FINALIZE_COMPLETE")
    rm -f ACTIVE_PR.json
    write_state "status" "INITIALIZING"
    exit 0
    ;;
  "AWAITING_ANALYSIS")
    handle_awaiting_analysis_state "$1"
    exit 0
    ;;
  "MERGING_BRANCH")
    set +e
    (eval "$1")
    exit_code=$?
    set -e
    if [ "$exit_code" -ne 0 ]; then
      write_state "status" "HALTED"
      echo "Merge conflict"
      exit 1
    fi
    set -e
    exit 0
    ;;
esac

test_command=$1
expectation=$2

if [ -z "$test_command" ]; then
  # Not a test execution, just a state transition
  exit 0
fi

set +e
(eval "$test_command" > output.log 2> error.log)
exit_code=$?
set -e
if [ "$exit_code" -eq 0 ] && [ "$expectation" == "FAIL" ]; then
  enter_debugging_state "Test was expected to FAIL but PASSED."
elif [ "$exit_code" -ne 0 ] && [ "$expectation" == "PASS" ]; then
  enter_debugging_state "Unexpected test failure"
elif [ "$exit_code" -ne 0 ] && [ "$expectation" == "FAIL" ]; then
  echo '{"status": "NEEDS_ANALYSIS"}'
else
  # Run preflight checks for tasks that are expected to pass to ensure code quality.
  if [ "$expectation" == "PASS" ]; then
    if [ "$SKIP_PREFLIGHT" != "true" ]; then
      npm run preflight
    fi
    # Mark the current TDD step as DONE
    task_index=$(jq 'map(.status == "TODO") | index(true)' <<< "$(jq -c '[.tasks[]]' ACTIVE_PR.json)")
    step_index=$(jq --argjson i "$task_index" '.[$i].tdd_steps | map(.status == "TODO") | index(true)' <<< "$(jq -c '.tasks' ACTIVE_PR.json)")
    
    jq --argjson ti "$task_index" --argjson si "$step_index" '.tasks[$ti].tdd_steps[$si].status = "DONE"' ACTIVE_PR.json > tmp.json && mv tmp.json ACTIVE_PR.json
  fi
fi



