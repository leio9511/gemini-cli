#!/bin/bash

set -e

for t in .agents/swe_agent/tests/*.test.sh; do
  echo "Running $t"
  bash "$t"
done
