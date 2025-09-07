#!/bin/bash

npm() {
    :
}
export -f npm

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

test_state_transition() {
  # Arrange
  rm -f ORCHESTRATION_STATE.json
  rm -f tmp.json
  echo '{"status": "INITIALIZING"}' > ORCHESTRATION_STATE.json
  echo '{"tasks": [{"expectation": "PASS"}]}' > ACTIVE_PR.json

  # Act
  .agents/swe_agent/tools/submit_work.sh

  # Assert
  expected='{"status":"EXECUTING_TDD"}'
  actual=$(cat ORCHESTRATION_STATE.json | tr -d ' \n')
  if [[ "$actual" != "$expected" ]]; then
    echo "Test failed: Expected '$expected', but got '$actual'"
    exit 1
  fi
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}
test_state_transition

test_red_step_needs_analysis() {
  # Arrange
  rm -f ORCHESTRATION_STATE.json
  echo '{"tasks": [{"tdd_steps": [{"type": "RED", "status": "TODO"}]}]}' > ACTIVE_PR.json
  echo '{"status": "EXECUTING_TDD"}' > ORCHESTRATION_STATE.json

  # Act
  output=$(.agents/swe_agent/tools/submit_work.sh "exit 1" "FAIL")

  # Assert
  expected_output='{"status": "NEEDS_ANALYSIS"}'
  if [[ "$output" != "$expected_output" ]]; then
    echo "Test failed: Expected output '$expected_output', but got '$output'"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}
test_red_step_needs_analysis

test_analysis_decision_handling() {
  # Arrange
  rm -f ORCHESTRATION_STATE.json
  echo '{"tasks": [{"tdd_steps": [{"type": "RED", "status": "TODO"}]}]}' > ACTIVE_PR.json
  echo '{"status": "AWAITING_ANALYSIS"}' > ORCHESTRATION_STATE.json

  # Act
  .agents/swe_agent/tools/submit_work.sh "SUCCESS"

  # Assert
  new_status=$(jq -r '.status' ORCHESTRATION_STATE.json)
  if [[ "$new_status" != "EXECUTING_TDD" ]]; then
    echo "Test failed: Expected status to be 'EXECUTING_TDD', but got '$new_status'"
    exit 1
  fi
  task_status=$(jq -r '.tasks[0].tdd_steps[0].status' ACTIVE_PR.json)
  if [[ "$task_status" != "DONE" ]]; then
    echo "Test failed: Expected task status to be 'DONE', but got '$task_status'"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}
test_analysis_decision_handling

