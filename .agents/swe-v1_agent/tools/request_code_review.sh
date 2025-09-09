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









# 3. Define the prompt for the Code Review Agent.
#    The agent's persona and main instructions are loaded from the settings file.
#    This prompt invokes the agent's `perform_code_review` capability,
#    providing the active PR spec (which contains the @-reference to the master plan) and the diff.
PROMPT="perform_code_review(spec_file=@$SPEC_FILE, diff_file=@$DIFF_FILE)"

# 4. Run the Code Review Agent and capture its JSON output.
REVIEW_RESULT=$($GEMINI_CLI --cf "$REVIEW_SETTINGS_FILE" -p "$PROMPT")

# 5. Clean up the temporary diff file
rm "$DIFF_FILE"
# 6. Return the JSON result
echo "$REVIEW_RESULT"
