#!/bin/bash
set -x

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Test case: When code review is approved, instruct to squash commits
test_get_task_instructs_to_squash_on_approval() {
  # Setup: Create a state file indicating code review is approved
  echo '{"status": "CODE_REVIEW"}' > "$WORK_DIR/ORCHESTRATION_STATE.json"
  # Create an empty findings file to simulate approval
  echo "[]" > "$WORK_DIR/FINDINGS.json"
  touch "$WORK_DIR/ACTIVE_PR.json"

  # Execute the get_task script
  .agents/swe_agent/tools/get_task.sh "$WORK_DIR" > "$WORK_DIR/output.txt"

  # Assert: The output contains instructions to squash commits
  if ! grep -q "squash your commits" "$WORK_DIR/output.txt"; then
    echo "Test failed: Output did not contain 'squash your commits'"
    exit 1
  fi
  # Assert: The state is updated to AWAITING_FINALIZATION
  local final_state=$(jq -r .status "$WORK_DIR/ORCHESTRATION_STATE.json")
  if [[ "$final_state" != "AWAITING_FINALIZATION" ]]; then
    echo "Test failed: Expected final state 'AWAITING_FINALIZATION', but got '$final_state'"
    exit 1
  fi
  echo "Test passed!"
}

# Test case: Verify submit_work checks for squashed commits
test_submit_work_verifies_squash() {
  # Setup
  cd "$WORK_DIR"
  git init
  git commit --allow-empty -m "Initial commit"
  git commit --allow-empty -m "feat: A"
  git commit --allow-empty -m "feat: B"
  git reset --soft HEAD~2
  git commit -m "feat: Squashed" -m "This is a squashed commit."
  local squashed_hash=$(git rev-parse HEAD)


  echo '{"status": "AWAITING_FINALIZATION"}' > "ORCHESTRATION_STATE.json"
  touch "ACTIVE_PR.json"
  touch "findings.json" # a dummy file




  # Act
  output=$("$SCRIPT_DIR/../tools/submit_work.sh" "dummy" "$squashed_hash")
  echo "Output was: $output"

  # Assert
  if [[ "$output" != "VERIFIED" ]]; then
    echo "Test failed: Expected output 'VERIFIED', but got '$output'"
    exit 1
  fi
}

test_get_task_instructs_to_update_plan() {
  # Setup
  echo '{"status": "AWAITING_FINALIZATION", "last_commit_hash": "some_hash"}' > "$WORK_DIR/ORCHESTRATION_STATE.json"
  touch "$WORK_DIR/ACTIVE_PR.json"

  # Act
  output=$("$SCRIPT_DIR/../tools/get_task.sh" "$WORK_DIR")

  # Assert
  if ! echo "$output" | grep -q "update the master plan"; then
    echo "Test failed: Output did not contain 'update the master plan'"
    exit 1
  fi
  local final_state=$(jq -r .status "$WORK_DIR/ORCHESTRATION_STATE.json")
  if [[ "$final_state" != "FINALIZE_COMPLETE" ]]; then
    echo "Test failed: Expected final state 'FINALIZE_COMPLETE', but got '$final_state'"
    exit 1
  fi
  echo "Test passed!"
}

test_submit_work_resets_state() {
  # Setup
  cd "$WORK_DIR"
  echo '{"status": "FINALIZE_COMPLETE"}' > "ORCHESTRATION_STATE.json"
  touch "ACTIVE_PR.json"

  # Act
  "$SCRIPT_DIR/../tools/submit_work.sh" "dummy" "dummy"

  # Assert
  if [ -f "ACTIVE_PR.json" ]; then
    echo "Test failed: ACTIVE_PR.json was not deleted"
    exit 1
  fi
  local final_state=$(jq -r .status "ORCHESTRATION_STATE.json")
  if [[ "$final_state" != "INITIALIZING" ]]; then
    echo "Test failed: Expected final state 'INITIALIZING', but got '$final_state'"
    exit 1
  fi
  echo "Test passed!"
}

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Run all tests
test_get_task_instructs_to_squash_on_approval
test_submit_work_verifies_squash
test_get_task_instructs_to_update_plan
test_submit_work_resets_state
