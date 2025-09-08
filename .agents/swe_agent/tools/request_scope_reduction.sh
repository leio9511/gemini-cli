#!/bin/bash

source .agents/swe_agent/utils.sh

debug_attempt_counter=$(read_state "debug_attempt_counter")

if [ "$debug_attempt_counter" -lt 3 ]; then
  echo "Error: Scope reduction is locked."
  exit 1
fi

PATH=.:$PATH git reset --hard HEAD


goal=$(jq -r '(.tasks[] | select(.status=="TODO")).taskName' ACTIVE_PR.json | head -n 1)
error_log=$(cat ERROR_LOG.txt)

cat <<EOF
Your previous attempt failed and all changes have been reverted. Your new assignment is to create a more granular plan.

1.  Analyze the original goal: '$goal' and the final error: \`$error_log\`.
2.  Break down the original task into the smallest possible verifiable Implementation Tasks, each with its own full Red-Green-Refactor cycle.
3.  The very last task in your new plan must be a 'Verification Task.' This task's purpose is to prove that the preceding sub-tasks collectively achieve the original goal. Its \`RED\` step should be a recreation of the original task's \`RED\` step.
4.  Update \`ACTIVE_PR.json\` to replace the original task with your new plan. The first new task must include a \`breakdownHistory\` object documenting the original goal and your justification.
EOF

