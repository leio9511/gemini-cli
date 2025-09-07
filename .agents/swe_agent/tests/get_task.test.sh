#!/bin/bash
set -e

INITIALIZATION_INSTRUCTION="Your mission is to create a pull request that implements the plan.

First, you must read the plan file and select the next pull request to implement.

Once you have identified the pull request, you must create a new file called \`ACTIVE_PR.json\` that contains the title, summary, and implementation tasks for the pull request.

The \`ACTIVE_PR.json\` file should be in the following format:
..."


# Test case: Verify that when all tasks are DONE, the state transitions to CODE_REVIEW.
test_code_review_trigger() {
  # Arrange
  echo '{"tasks": [{"status": "DONE"}, {"status": "DONE"}]}' > ACTIVE_PR.json
  echo '{}' > ORCHESTRATION_STATE.json
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

# Test case: Verify that when ACTIVE_PR.json does not exist, the correct initialization instruction is returned.
test_initialization_instruction() {
  # Arrange
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)

  # Assert
  if [[ "$output" != "$INITIALIZATION_INSTRUCTION" ]]; then
      echo "Test failed: Expected output '$INITIALIZATION_INSTRUCTION', but got '$output'"
      exit 1
  fi
  echo "Test passed!"
}

# Run the test
test_code_review_trigger
test_initialization_instruction

test_tdd_execution_instruction() {
  # Arrange
  echo '{"tasks": [{"description": "Write a test for the new feature", "status": "TODO"}]}' > ACTIVE_PR.json
  echo '{"status": "EXECUTING_TDD"}' > ORCHESTRATION_STATE.json

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)

  # Assert
  expected_instruction="Your goal is to complete the next TDD step: Write a test for the new feature"
  if [[ "$output" != "$expected_instruction" ]]; then
      echo "Test failed: Expected output '$expected_instruction', but got '$output'"
      exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}
test_tdd_execution_instruction

test_safety_checkpoint_instruction() {
  # Arrange
  echo '{"tasks": [{"status": "DONE"}, {"status": "TODO"}]}' > ACTIVE_PR.json
  echo '{"status": "EXECUTING_TDD", "last_completed_step": "GREEN"}' > ORCHESTRATION_STATE.json

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)

  # Assert
  expected_instruction="You have just completed a TDD step. This is a good time to create a safety checkpoint commit."
  if [[ "$output" != "$expected_instruction" ]]; then
      echo "Test failed: Expected output '$expected_instruction', but got '$output'"
      exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}
test_safety_checkpoint_instruction








