#!/bin/bash
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

TOOL_NAME=$1

case "$TOOL_NAME" in
    get_task)
        "$SCRIPT_DIR/get_task.sh"
        ;;
    submit_work)
        "$SCRIPT_DIR/submit_work.sh"
        ;;
    request_scope_reduction)
        "$SCRIPT_DIR/request_scope_reduction.sh"
        ;;
    escalate_for_external_help)
        "$SCRIPT_DIR/escalate_for_external_help.sh"
        ;;
    *)
        echo "Unknown tool: $TOOL_NAME" >&2
        exit 1
        ;;
esac
