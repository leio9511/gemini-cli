#!/bin/bash
set -e

DESIGN_DOC_PATH=$1
GENERATED_PLAN_PATH=$2
GEMINI_CLI="gemini"

PROMPT=$(cat <<EOF
You are an expert engineering manager serving as a quality gate. Your sole task is to review a generated engineering plan against its original design document.
You must verify two critical principles:
1.  **1:1 Mapping and Granularity:** Every single requirement, state transition, and test case from the design document MUST have a corresponding, explicit "Planned Implementation Task" in the generated plan.
2.  **No Vague Tasks:** The plan MUST NOT contain any vague, "catch-all" tasks like "implement the rest of the tests." Every task must be atomic and specific.
Analyze the two files provided. Your output MUST be a JSON object with a single key, "findings", which is an array of strings.
- If the plan is perfect, return an empty array: \`{"findings": []}\`.
- If there are issues, for each issue, add a descriptive string to the array.
**Design Document:** @${DESIGN_DOC_PATH}
**Generated Plan:** @${GENERATED_PLAN_PATH}
EOF
)

REVIEW_RESULT=$($GEMINI_CLI -p "$PROMPT")

echo "$REVIEW_RESULT"





