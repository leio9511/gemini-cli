#!/bin/bash

source .agents/swe_agent/utils.sh

test_default_state_creation() {
  # Arrange
  rm -f ORCHESTRATION_STATE.json
  touch ACTIVE_PR.json

  # Act
  write_state "status" "INITIALIZING"
  
  # Assert
  if [ ! -f "ORCHESTRATION_STATE.json" ]; then
    echo "Test failed: ORCHESTRATION_STATE.json was not created"
    exit 1
  fi
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}

test_default_state_creation
