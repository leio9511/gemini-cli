#!/bin/bash
set -e

TOOL_NAME=$1
shift


case "$TOOL_NAME" in
    get_task)
        .agents/swe_agent/tools/get_task.sh "$@"
        ;;
    submit_work)
        .agents/swe_agent/tools/submit_work.sh "$@"
        ;;
    request_scope_reduction)
        .agents/swe_agent/tools/request_scope_reduction.sh "$@"
        ;;
    escalate_for_external_help)
        .agents/swe_agent/tools/escalate_for_external_help.sh "$@"
        ;;
    request_code_review)
        .agents/swe_agent/tools/request_code_review.sh "$@"
        ;;
    *)
        echo "Unknown tool: $TOOL_NAME" >&2
        exit 1
        ;;
esac
