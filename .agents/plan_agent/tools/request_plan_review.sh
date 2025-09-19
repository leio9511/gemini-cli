#!/bin/bash
set -e

TOOL_ARGS=$(cat)

# Extract paths from the JSON string using jq.
DESIGN_DOC_PATH=$(echo "$TOOL_ARGS" | jq -r '.design_doc_path')
GENERATED_PLAN_PATH=$(echo "$TOOL_ARGS" | jq -r '.generated_plan_path')

if [ -z "$DESIGN_DOC_PATH" ] || [ "$DESIGN_DOC_PATH" == "null" ]; then
  echo "Error: Could not parse design_doc_path from the input: $TOOL_ARGS" >&2
  exit 1
fi

if [ -z "$GENERATED_PLAN_PATH" ] || [ "$GENERATED_PLAN_PATH" == "null" ]; then
  echo "Error: Could not parse generated_plan_path from the input: $TOOL_ARGS" >&2
  exit 1
fi

GEMINI_CLI="gemini"


PROMPT=$(cat <<EOF
You are an expert engineering manager serving as a quality gate. Your sole task is to review a generated engineering plan against its original design document.
You must verify these critical principles:
1.  **Strict TDD Structure:** All "Planned Implementation Tasks" MUST be broken down into a sequence of \`[RED]\`, \`[GREEN]\`, and \`[REFACTOR]\` steps. A plan that lists implementation tasks without this structure is invalid.
2.  **1:1 Mapping and Granularity:** Every single requirement, state transition, and test case from the design document MUST have a corresponding, explicit "Planned Implementation Task" in the generated plan.
3.  **No Vague Tasks:** The plan MUST NOT contain any vague, "catch-all" tasks like "implement the rest of the tests." Every task must be atomic and specific.
4.  **Reference Design Doc:** The plan MUST contain a reference to the original design document, in the format \`**Reference Design Doc:** @[path/to/design/doc.md]\`.
Analyze the two files provided. Your output MUST be a JSON object with a single key, "findings", which is an array of strings.
- If the plan is perfect, return an empty array: \`{"findings": []}\`.
- If there are issues, for each issue, add a descriptive string to the array.
**Design Document:** @${DESIGN_DOC_PATH}
**Generated Plan:** @${GENERATED_PLAN_PATH}
EOF
)

REVIEW_RESULT=$($GEMINI_CLI -p "$PROMPT")

echo "$REVIEW_RESULT"
