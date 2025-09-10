#!/bin/bash
# .agents/swe-v1_agent/tools/request_code_review.sh

# 1. Define file paths and the gemini command
DIFF_FILE="PR_DIFF.txt"
REVIEW_SETTINGS_FILE=".agents/code_review_agent/settings.json"
SPEC_FILE="ACTIVE_PR.md"
DEFAULT_SETTINGS_FILE=".gemini/settings.json"
GEMINI_CLI="gemini"

# 2. Generate the diff. If there are no changes, exit gracefully.
git diff main...HEAD > "$DIFF_FILE"
if [ ! -s "$DIFF_FILE" ]; then
  echo "{\"error\": \"No changes detected between this branch and main.\"}"
  rm "$DIFF_FILE"
  exit 0
fi

# 3. Extract the master plan path from the spec file.
if [ ! -f "$SPEC_FILE" ]; then
  echo "{\"error\": \"Spec file ACTIVE_PR.md not found.\"}"
  rm "$DIFF_FILE"
  exit 1
fi
MASTER_PLAN_PATH=$(grep -o '@\S*' "$SPEC_FILE" | head -n 1)
if [ -z "$MASTER_PLAN_PATH" ]; then
  echo "{\"error\": \"Could not find master plan path in ACTIVE_PR.md.\"}"
  rm "$DIFF_FILE"
  exit 1
fi

# 4. Define the prompt for the Code Review Agent.
#    The agent's persona and main instructions are loaded from the settings file.
#    This prompt invokes the agent's `perform_code_review` capability,
#    providing the master plan, the active PR spec, and the diff.
PROMPT="perform_code_review(master_plan=$MASTER_PLAN_PATH, spec_file=@$SPEC_FILE, diff_file=@$DIFF_FILE)"

# 5. Run the Code Review Agent and capture its JSON output.
REVIEW_RESULT=$($GEMINI_CLI --cf "$REVIEW_SETTINGS_FILE" -p "$PROMPT")

# 6. Clean up the temporary diff file
rm "$DIFF_FILE"
# 7. Return the JSON result
echo "$REVIEW_RESULT"
