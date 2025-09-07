#!/bin/bash

source .agents/swe_agent/utils.sh

test_tool_locking() {
  # Arrange
  rm -f ORCHESTRATION_STATE.json
  rm -rf "$LOCK_DIR" # Clean up any stale lock from previous runs
  write_state "debug_attempt_counter" "0"

  # Act
  output=$(.agents/swe_agent/tools/request_scope_reduction.sh 2>&1)
  exit_code=$?

  # Assert
  if [[ $exit_code -eq 0 ]]; then
      echo "Test failed: Script should have exited with a non-zero status."
      exit 1
  fi
  if [[ "$output" != "Error: Scope reduction is locked." ]]; then
    echo "Test failed: Expected 'Error: Scope reduction is locked.', but got '$output'"
    exit 1
  fi
}


test_tool_locking

test_replanning_instruction() {
  # Arrange
  rm -f ORCHESTRATION_STATE.json
  rm -rf "$LOCK_DIR"
  write_state "debug_attempt_counter" "3"
  echo "Test error log" > ERROR_LOG.txt
  echo '{"goal": "Test goal"}' > ACTIVE_PR.json
  touch git_reset_executed.marker
  # Create a mock git script
  echo -e '#!/bin/bash\nrm -f git_reset_executed.marker' > git
  chmod +x git


  # Act
  PATH=.:$PATH output=$(.agents/swe_agent/tools/request_scope_reduction.sh)

  # Assert
  if [[ "$output" != *"REPLAN"* ]]; then
    echo "Test failed: Expected 'REPLAN' in output, but got '$output'"
    exit 1
  fi
}

test_replanning_instruction

rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json ERROR_LOG.txt git


