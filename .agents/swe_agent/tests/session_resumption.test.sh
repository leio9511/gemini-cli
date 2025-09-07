#!/bin/bash


test_session_resumption() {
  # Arrange
  echo '{"tasks": [{"status": "DONE"}, {"status": "TODO", "description": "test description"}]}' > ACTIVE_PR.json
  rm -f ORCHESTRATION_STATE.json

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)


  # Assert
  expected_output="Your goal is to complete the next TDD step: "
  if [[ "$output" != "Your goal is to complete the next TDD step: test description" ]]; then
    echo "Test failed: Expected '$expected_output', but got '$output'"
    exit 1
  fi
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}

test_session_resumption
