#!/bin/bash
set -e

# Test case: Verify that when a code review is approved, the agent is instructed to squash commits.
test_finalization_instruction() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR_DONE.json ACTIVE_PR.json
  echo '{"status": "CODE_REVIEW"}' > ORCHESTRATION_STATE.json
  echo "[]" > findings.json
  sleep 0.1

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)

  # Assert
  if [[ "$output" != "SQUASH_COMMITS" ]]; then
    echo "Test failed: Expected output 'SQUASH_COMMITS', but got '$output'"
    exit 1
  fi
  local final_state=$(jq -r .status ORCHESTRATION_STATE.json)
  if [[ "$final_state" != "AWAITING_FINALIZATION" ]]; then
    echo "Test failed: Expected final state 'AWAITING_FINALIZATION', but got '$final_state'"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json findings.json
}

# Run the test
test_finalization_instruction
