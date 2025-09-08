#!/bin/bash
set -e

# Test case: Verify that when all tasks are DONE, the session is treated as stale and reset.
test_stale_session_reset() {
  # Arrange
  TEST_DIR=$(mktemp -d)
  cd "$TEST_DIR"

  echo '{"tasks": [{"status": "DONE"}, {"status": "DONE"}]}' > ACTIVE_PR.json
  echo '{"status": "CODE_REVIEW"}' > ORCHESTRATION_STATE.json

  # Act
  output=$(bash /usr/local/google/home/lychen/Projects/gemini-cli/.agents/swe_agent/tools/get_task.sh "$TEST_DIR")

  # Assert
  if [ -f "ACTIVE_PR.json" ]; then
    echo "Test failed: ACTIVE_PR.json was not deleted."
    exit 1
  fi
  expected_output="Your mission is to create a pull request"
  if [[ "$output" != *"$expected_output"* ]]; then
    echo "Test failed: Expected output to contain '$expected_output', but got '$output'"
    exit 1
  fi
  echo "Test passed!"
  rm -rf "$TEST_DIR"
}

# Run the test
test_stale_session_reset
