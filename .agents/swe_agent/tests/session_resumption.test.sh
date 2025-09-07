#!/bin/bash

test_session_resumption() {
  # Arrange
  echo '{"tasks": [{"status": "DONE"}, {"status": "TODO"}]}' > ACTIVE_PR.json
  rm -f ORCHESTRATION_STATE.json

  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)

  # Assert
  if [[ "$output" != "EXECUTE_TASK" ]]; then
    echo "Test failed: Expected 'EXECUTE_TASK', but got '$output'"
    exit 1
  fi
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}

test_session_resumption
