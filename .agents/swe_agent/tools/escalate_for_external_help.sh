#!/bin/bash
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
source "$SCRIPT_DIR/../utils.sh"

debug_attempt_counter=$(read_state "debug_attempt_counter")
if [ -z "$debug_attempt_counter" ]; then
    debug_attempt_counter=0
fi
if [ "$debug_attempt_counter" -lt 3 ]; then
    echo "This tool is locked." >&2
    exit 1
fi

echo "Escalating for external help. Please provide a new ACTIVE_PR.json file."
exit 0
