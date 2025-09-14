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

if [ -z "$1" ]; then
    echo "Usage: $0 <markdown_report>" >&2
    exit 1
fi

echo "$1"
exit 10
