#!/bin/bash
# .agents/swe-v1_agent/tools/discover.sh
cat <<EOF
[
  {
    "name": "request_code_review",
    "description": "Initiates a code review of the current changes against the 'main' branch. This tool will run the Code Review Agent and return its findings as a JSON string. This should be called after all implementation tasks in ACTIVE_PR.md are completed and committed.",
    "parameters": {
      "type": "OBJECT",
      "properties": {},
      "required": []
    }
  }
]
EOF
