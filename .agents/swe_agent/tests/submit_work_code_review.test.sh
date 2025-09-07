#!/bin/bash
set -e

source .agents/swe_agent/utils.sh

# Test case: Verify that when findings are submitted during the CODE_REVIEW state, a new task is added to ACTIVE_PR.json.
test_code_review_feedback() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR.json .
  cp .agents/swe_agent/tests/fixtures/ORCHESTRATION_STATE.json .
  findings_file=$(mktemp)
  echo '[{"file_path": "file1.txt", "finding": "error 1"}, {"file_path": "file2.txt", "finding": "error 2"}]' > "$findings_file"

  # Act
  .agents/swe_agent/tools/submit_work.sh "$findings_file"

  # Assert
  if ! jq -e '.tasks[] | select(.file_path=="file1.txt")' ACTIVE_PR.json > /dev/null; then
    echo "Test failed: Task for file1.txt not found"
    exit 1
  fi
  if ! jq -e '.tasks[] | select(.file_path=="file2.txt")' ACTIVE_PR.json > /dev/null; then
    echo "Test failed: Task for file2.txt not found"
    exit 1
  fi
  local final_state=$(read_state "status")
  if [[ "$final_state" != "EXECUTING_TDD" ]]; then
    echo "Test failed: Expected final state 'EXECUTING_TDD', but got '$final_state'"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}

# Run the test
test_code_review_feedback
