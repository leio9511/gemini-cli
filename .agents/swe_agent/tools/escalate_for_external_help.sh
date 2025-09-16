#!/bin/bash
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
source "$SCRIPT_DIR/../utils.sh"

debug_attempt_counter=$(read_state "debug_attempt_counter")
if [ -z "$debug_attempt_counter" ]; then
    debug_attempt_counter=0
fi
unlock_escalation_at=$(read_config_value "unlock_escalation_at")
if [ "$debug_attempt_counter" -lt "$unlock_escalation_at" ]; then
    echo "Error: This tool is locked. You must make at least $unlock_escalation_at debugging attempts before escalating. You have currently made $debug_attempt_counter attempt(s)." >&2
    exit 1
fi

TOOL_ARGS=$(cat)
markdown_report=$(echo "$TOOL_ARGS" | jq -r '.markdown_report')

if [ -z "$markdown_report" ]; then
    echo "Usage: escalate_for_external_help '{\"markdown_report\": \"...\"}'" >&2
    exit 1
fi

echo "$markdown_report"
exit 10

