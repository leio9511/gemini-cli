#!/bin/bash

source .agents/swe_agent/utils.sh


test_halt_signal() {
  # Arrange
  write_state "debug_attempt_counter" 3
  report="Test report"

  # Act
  set +e
  output=$(.agents/swe_agent/tools/escalate_for_external_help.sh "$report")
  exit_code=$?
  set -e

  # Assert
  if [[ "$output" != "$report" ]]; then
    echo "Test failed: Expected '$report', but got '$output'"
    exit 1
  fi
  if [[ $exit_code -ne 10 ]]; then
    echo "Test failed: Expected exit code 10, but got $exit_code"
    exit 1
  fi
}
rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json

test_halt_signal

test_tool_gating() {
  # Arrange
  echo '{"debug_attempt_counter": 2}' > ORCHESTRATION_STATE.json

  # Act
  set +e
  output=$(.agents/swe_agent/tools/escalate_for_external_help.sh 2>&1)
  exit_code=$?
  set -e

  # Assert
  if [ "$exit_code" -eq 0 ]; then
    echo "Test failed: Expected a non-zero exit code, but got 0"
    exit 1
  fi
  expected_error="Tool is locked. You must make at least 3 debugging attempts before escalating for external help."
  if [[ "$output" != "$expected_error" ]]; then
    echo "Test failed: Expected error message '$expected_error', but got '$output'"
    exit 1
  fi
  echo "Test passed!"
  rm -f ORCHESTRATION_STATE.json
}
test_tool_gating

