#!/bin/bash

source .agents/swe_agent/utils.sh

test_halt_signal() {
  # Arrange
  report="Test report"

  # Act
  output=$(.agents/swe_agent/tools/escalate_for_external_help.sh "$report")
  exit_code=$?

  # Assert
  if [[ "$output" != "$report" ]]; then
    echo "Test failed: Expected '$report', but got '$output'"
    exit 1
  fi
  if [[ $exit_code -ne 10 ]]; then
    echo "Test failed: Expected exit code 10, but got $exit_code"
    exit 1
  fi
}
rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json

test_halt_signal
