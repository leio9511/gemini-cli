#!/bin/bash
set -e

output=$(.agents/swe_agent/tools/discover.sh)

if ! echo "$output" | grep -q "request_code_review"; then
  echo "Test failed: discover.sh does not output request_code_review tool"
  exit 1
fi

rm -f ACTIVE_PR.json ORCHESTRATION_STATE.json
