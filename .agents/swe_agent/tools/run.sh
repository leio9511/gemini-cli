#!/bin/bash
# .agents/swe_agent/tools/run.sh

TOOL_NAME=$1
PARAMETERS=$2
TOOL_DIR=$(dirname "$0")

if [ "$TOOL_NAME" == "request_code_review" ]; then
  "$TOOL_DIR/request_code_review.sh"
else
  echo "Unknown tool: $TOOL_NAME"
fi
