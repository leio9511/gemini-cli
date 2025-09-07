#!/bin/bash
set -e
set -x

# Test case: Verify that when all tasks are DONE, the state transitions to CODE_REVIEW.
test_code_review_trigger() {
  # Arrange
  echo '{"tasks": [{"status": "DONE"}, {"status": "DONE"}]}' > ACTIVE_PR.json
  echo '{"status": "EXECUTING_TDD"}' > ORCHESTRATION_STATE.json
  rm -rf "$LOCK_DIR" # Ensure no stale locks before starting

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)

  # Assert
  if [[ "$output" != "REQUEST_REVIEW" ]]; then
      echo "Test failed: Expected output 'REQUEST_REVIEW', but got '$output'"
      exit 1
  fi
  local final_state=$(jq -r .status ORCHESTRATION_STATE.json)
  if [[ "$final_state" != "CODE_REVIEW" ]]; then
    echo "Test failed: Expected final state 'CODE_REVIEW', but got '$final_state'"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}

# Run the test
test_code_review_trigger

