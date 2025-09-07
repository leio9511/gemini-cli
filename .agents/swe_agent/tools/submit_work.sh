#!/bin/bash
set -e

if ! command -v jq &> /dev/null
then
    echo "jq could not be found"
    exit 1
fi

if [ ! -f "ACTIVE_PR.json" ]; then
    echo "ACTIVE_PR.json not found"
    exit 1
fi


source .agents/swe_agent/utils.sh

handle_initializing_state() {
  write_state "status" "EXECUTING_TDD"
}

handle_code_review_state() {
  findings_file=$1
  if [ -f "$findings_file" ]; then
    # Create new tasks from findings
    jq -s '.[0] * {tasks: .[0].tasks + .[1]}' ACTIVE_PR.json "$findings_file" > tmp.json && mv tmp.json ACTIVE_PR.json
    write_state "status" "EXECUTING_TDD"
  fi
}

enter_debugging_state() {
  current_attempts=$(read_state "debug_attempt_counter" || echo 0)
  new_attempts=$((current_attempts + 1))
  write_state "status" "DEBUGGING"
  write_state "debug_attempt_counter" "$new_attempts"
}

status=$(read_state "status")

case "$status" in
  "INITIALIZING")
    handle_initializing_state
    ;;
  "CODE_REVIEW")
    handle_code_review_state "$1"
    ;;
esac

if [ "$status" != "INITIALIZING" ]; then
  shift
fi
test_command=$1
expectation=$2

if [ -z "$test_command" ]; then
  # Not a test execution, just a state transition
  exit 0
fi

set +e
(eval "$test_command" > >(tee output.log) 2> >(tee error.log >&2))
exit_code=$?
set -e
if [ "$exit_code" -eq 0 ] && [ "$expectation" == "FAIL" ]; then
  enter_debugging_state
elif [ "$exit_code" -ne 0 ] && [ "$expectation" == "PASS" ]; then
  enter_debugging_state
else
  # Run preflight checks for tasks that are expected to pass to ensure code quality.
  if [ "$expectation" == "PASS" ]; then
    npm run preflight
  fi
fi



