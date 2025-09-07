#!/bin/bash
set -e

# This script tests the debugging guidance provided by the get_task.sh script.

source .agents/swe_agent/utils.sh
 
# Test case 1: Verify "Hypothesize & Fix" guidance for low attempt counts.
test_hypothesize_and_fix_guidance() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR.json .
  echo '{"status": "DEBUGGING", "debug_attempt_counter": 1}' > ORCHESTRATION_STATE.json
  echo "error message" > error.log
 
  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)
 
  # Assert
  if ! echo "$output" | grep -q "Hypothesize & Fix"; then
    echo "Test failed: Output does not contain 'Hypothesize & Fix' guidance"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json error.log
}
 
# Test case 2: Verify "Use Instrumentation" guidance for medium attempt counts.
test_use_instrumentation_guidance() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR.json .
  echo '{"status": "DEBUGGING", "debug_attempt_counter": 4}' > ORCHESTRATION_STATE.json
  echo "error message" > error.log
 
  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)
 
  # Assert
  if ! echo "$output" | grep -q "Use Instrumentation"; then
    echo "Test failed: Output does not contain 'Use Instrumentation' guidance"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json error.log
}
 
# Test case 3: Verify "Conclude the task is too complex" guidance for high attempt counts.
test_conclude_task_is_too_complex_guidance() {
  # Arrange
  cp .agents/swe_agent/tests/fixtures/ACTIVE_PR.json .
  echo '{"status": "DEBUGGING", "debug_attempt_counter": 7}' > ORCHESTRATION_STATE.json
  echo "error message" > error.log
 
  # Act
  output=$(.agents/swe_agent/tools/get_task.sh)
 
  # Assert
  if ! echo "$output" | grep -q "Conclude the task is too complex"; then
    echo "Test failed: Output does not contain 'Conclude the task is too complex' guidance"
    exit 1
  fi
  echo "Test passed!"
  rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json error.log
}
 
# Run the tests
test_hypothesize_and_fix_guidance
test_use_instrumentation_guidance
test_conclude_task_is_too_complex_guidance
