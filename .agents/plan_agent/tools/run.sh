#!/bin/bash
set -e

TOOL_NAME=$1

case "$TOOL_NAME" in
    request_plan_review)
        .agents/plan_agent/tools/request_plan_review.sh
        ;;
    *)
        echo "Unknown tool: $TOOL_NAME" >&2
        exit 1
        ;;
esac
