# Agent Tool Architecture

This document outlines the correct architectural pattern for creating and invoking custom tools for agents within the `gemini-cli` framework. Adhering to this pattern is crucial for ensuring that tools are robust, testable, and work correctly with the argument-passing mechanism.

## Core Principles

1.  **`run.sh` is a Simple Dispatcher:** The root `run.sh` script in an agent's `tools/` directory must be a simple `case` statement. Its only job is to look at the first argument (the tool name) and call the corresponding tool script. It **MUST NOT** attempt to parse or pass any other arguments.

2.  **Tools Read Arguments from Standard Input:** The `gemini-cli` framework passes all tool arguments as a single JSON string to the standard input of the `run.sh` script. The `run.sh` script, in turn, pipes this stdin to the specific tool script being called.

3.  **Parse Arguments with `jq`:** Each individual tool script (e.g., `my_tool.sh`) is responsible for parsing its own arguments from stdin. The standard and required method for this is to use `cat` to read stdin and `jq` to parse the JSON.

## Example Implementation

This example shows the correct way to implement an agent with two tools: `get_task` (no arguments) and `submit_work` (with arguments).

### 1. `tools/discover.sh`

This file defines the tools and their parameters.

```bash
#!/bin/bash
set -e

cat <<EOF
[
  {
    "name": "get_task",
    "description": "Gets the next task.",
    "parameters": { "type": "OBJECT", "properties": {}, "required": [] }
  },
  {
    "name": "submit_work",
    "description": "Submits work for review.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "test_command": { "type": "STRING" },
        "expectation": { "type": "STRING", "enum": ["PASS", "FAIL"] }
      },
      "required": ["summary"]
    }
  }
]
EOF
```

### 2. `tools/run.sh` (The Dispatcher)

Note that the tool scripts are called without any arguments (`$@`).

```bash
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
    *)
        echo "Unknown tool: $TOOL_NAME" >&2
        exit 1
        ;;
esac
```

### 3. `tools/submit_work.sh` (The Tool Implementation)

This script reads from stdin and uses `jq` to extract its arguments into shell variables.

```bash
#!/bin/bash
set -e

# Read the JSON arguments from stdin
TOOL_ARGS=$(cat)

# Parse the arguments using jq
# Use `// empty` to prevent errors if a parameter is not provided
test_command=$(echo "$TOOL_ARGS" | jq -r '.test_command // empty')
expectation=$(echo "$TOOL_ARGS" | jq -r '.expectation // empty')

# Now, use the variables in your script's logic
if [ -n "$test_command" ]; then
    echo "Running test: $test_command with expectation: $expectation"
    # ... rest of the tool logic ...
fi
```

By following this pattern, you ensure that your tools correctly receive their arguments and that the testing framework can accurately simulate the agent's execution environment.
