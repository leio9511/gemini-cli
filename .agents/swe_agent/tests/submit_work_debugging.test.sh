#!/bin/bash
set -e

source .agents/swe_agent/utils.sh

# Test case: Verify that when a PASS expectation fails, the state transitions to DEBUGGING.
test_debugging_transition_on_unexpected_fail() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR.json .
  cp .agents/swe_agent/tests/fixtures/ORCHESTRATION_STATE.json .

  # Act
  .agents/swe_agent/tools/submit_work.sh "" "exit 1" "PASS"

  # Assert
  local final_state=$(read_state "status")
  if [[ "$final_state" != "DEBUGGING" ]]; then
    echo "Test failed: Expected final state 'DEBUGGING', but got '$final_state'"
    exit 1
  fi
  local debug_counter=$(read_state "debug_attempt_counter")
  if [[ "$debug_counter" != "1" ]]; then
    echo "Test failed: Expected debug_attempt_counter to be 1, but got '$debug_counter'"
    exit 1
  fi
  if [ ! -f "error.log" ]; then
    echo "Test failed: error.log not found"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json error.log output.log
}

# Run the test
test_debugging_transition_on_unexpected_pass() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR.json .
  cp .agents/swe_agent/tests/fixtures/ORCHESTRATION_STATE.json .

  # Act
  .agents/swe_agent/tools/submit_work.sh "" "exit 0" "FAIL"

  # Assert
  local final_state=$(read_state "status")
  if [[ "$final_state" != "DEBUGGING" ]]; then
    echo "Test failed: Expected final state 'DEBUGGING', but got '$final_state'"
    exit 1
  fi
  local debug_counter=$(read_state "debug_attempt_counter")
  if [[ "$debug_counter" != "1" ]]; then
    echo "Test failed: Expected debug_attempt_counter to be 1, but got '$debug_counter'"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json error.log output.log
}

# Run the tests
test_debugging_transition_on_unexpected_fail
test_debugging_transition_on_unexpected_pass

