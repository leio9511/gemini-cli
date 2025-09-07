#!/bin/bash

source .agents/swe_agent/utils.sh

debug_attempt_counter=$(read_state "debug_attempt_counter")

if [ "$debug_attempt_counter" -lt 3 ]; then
  echo "Error: Scope reduction is locked."
  exit 1
fi

PATH=.:$PATH git reset --hard HEAD

goal=$(jq -r '.goal' ACTIVE_PR.json)
error_log=$(cat ERROR_LOG.txt)
echo "REPLAN: Goal: $goal, Error Log: $error_log"
