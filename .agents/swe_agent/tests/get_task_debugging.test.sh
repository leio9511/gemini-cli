#!/bin/bash
set -e

source .agents/swe_agent/utils.sh

# Test case: Verify that when the state is DEBUGGING, the output includes the error log and strategic guidance.
test_debugging_guidance() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR.json .
  echo '{"status": "DEBUGGING", "debug_attempt_counter": 1}' > ORCHESTRATION_STATE.json
  echo "error message" > error.log

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)

  # Assert
  if ! echo "$output" | grep -q "error message"; then
    echo "Test failed: Output does not contain error log"
    exit 1
  fi
  if ! echo "$output" | grep -q "You have made 1 debugging attempts. You can request scope reduction after 3 attempts."; then
    echo "Test failed: Output does not contain strategic guidance"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json error.log
}

# Run the test
test_debugging_guidance
