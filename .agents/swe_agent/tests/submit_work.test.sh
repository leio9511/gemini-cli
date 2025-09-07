#!/bin/bash

npm() {
    :
}
export -f npm

source .agents/swe_agent/utils.sh

test_state_transition() {
  # Arrange
  rm -f ORCHESTRATION_STATE.json
  rm -f tmp.json
  echo '{"status": "INITIALIZING"}' > ORCHESTRATION_STATE.json
  echo '{"tasks": [{"expectation": "PASS"}]}' > ACTIVE_PR.json

  # Act
  .agents/swe_agent/tools/submit_work.sh

  # Assert
  expected='{"status":"EXECUTING_TDD"}'
  actual=$(cat ORCHESTRATION_STATE.json | tr -d ' \n')
  if [[ "$actual" != "$expected" ]]; then
    echo "Test failed: Expected '$expected', but got '$actual'"
    exit 1
  fi
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
}
test_state_transition

