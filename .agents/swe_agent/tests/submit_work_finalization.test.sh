#!/bin/bash

# Test for finalization bug where commit hash is not saved
#
# This test simulates the finalization step of the SWE Agent workflow.
# It verifies that when submit_work.sh is called in the AWAITING_FINALIZATION
# state, it correctly saves the commit hash to the orchestration state file.

# Create a temporary directory for the test
test_dir=$(mktemp -d)
cd "$test_dir"

# Create dummy orchestration state file
cat > ORCHESTRATION_STATE.json <<EOL
{
  "status": "AWAITING_FINALIZATION"
}
EOL

# Create a dummy ACTIVE_PR.json file
touch ACTIVE_PR.json

# Mock the git command
mkdir bin
cat > bin/git <<EOL
#!/bin/bash
if [ "\$1" == "rev-list" ]; then
  echo "1"
else
  echo "mock_hash"
fi
EOL
chmod +x bin/git
export PATH=$(pwd)/bin:$PATH

# Path to the script to be tested
submit_work_script_path="/usr/local/google/home/lychen/Projects/gemini-cli/.agents/swe_agent/tools/submit_work.sh"

# Run the script
bash "$submit_work_script_path" "Finalized PR" "mock_hash"

# Check the output
if ! jq -e '.last_commit_hash == "mock_hash"' ORCHESTRATION_STATE.json > /dev/null; then
  echo "Test Failed: last_commit_hash was not found in ORCHESTRATION_STATE.json"
  exit 1
fi

echo "Test Passed: last_commit_hash was correctly saved."

# Cleanup
rm -rf "$test_dir"
