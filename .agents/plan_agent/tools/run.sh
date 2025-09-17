#!/bin/bash
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

TOOL_NAME=$1

case "$TOOL_NAME" in
    request_plan_review)
        "$SCRIPT_DIR/request_plan_review.sh"
        ;;
    *)
        echo "Unknown tool: $TOOL_NAME" >&2
        exit 1
        ;;
esac
