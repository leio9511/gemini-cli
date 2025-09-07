#!/bin/bash
set -e

setup_test_env() {
  TEST_DIR=$(mktemp -d)
  cd "$TEST_DIR"
  # Make a dummy master plan file that the script can find
  mkdir -p docs/plans
  touch docs/plans/fix-swe-agent-discrepancies.plan.md
}

cleanup_test_env() {
  rm -rf "$TEST_DIR"
}

# Test for stale session cleanup functionality in get_task.sh
test_stale_session_cleanup() {
  # Setup test environment
  setup_test_env
  # Ensure cleanup happens even if the test fails
  trap cleanup_test_env EXIT
  # Create a fixture for a completed ACTIVE_PR.json
  echo '{"tasks": [{"status": "DONE"}, {"status": "DONE"}]}' > ACTIVE_PR.json

  # Run the get_task.sh script
  # The script is expected to fail because it will try to find the master plan, which doesn't exist in our test env.
  # We are only interested in the side-effects (file deletion) and the initial output.
  output=$(bash /usr/local/google/home/lychen/Projects/gemini-cli/.agents/swe_agent/tools/get_task.sh)

  # Assertion 1: Check if ACTIVE_PR.json was deleted
  if [ -f "ACTIVE_PR.json" ]; then
    echo "FAIL: ACTIVE_PR.json was not deleted."
    exit 1
  fi

  # Assertion 2: Check if the output is the initialization instruction
  expected_output="Your mission is to create a pull request"
  if [[ "$output" != *"$expected_output"* ]]; then
    echo "FAIL: The output did not contain the expected initialization instruction."
    echo "Expected to find: $expected_output"
    echo "Got: $output"
    exit 1
  fi

  echo "PASS: Stale session cleanup test passed."
}

# Run the test
test_stale_session_cleanup
