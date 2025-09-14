# Design Doc: SWE Agent Test Remediation and Configuration

**Status:** PROPOSED

## 1. Overview

The SWE Agent is a critical component of our automated engineering workflow, but its integration test suite is currently failing, and its implementation has several key deviations from its original design. This document outlines a plan to:

1.  **Remediate all failing tests** to establish a reliable, green baseline for agent behavior.
2.  **Align the `escalate_for_external_help` tool** with its designed purpose as a human-in-the-loop handoff mechanism.
3.  **Decouple the debugging strategy** from the agent's core logic by making its thresholds configurable.

## 2. Problem Analysis & Proposed Solutions

### 2.1. Failing Integration Tests

A recent test run revealed 8 failures in the `orchestration.integration.test.ts` suite. The root causes are a combination of improper mocking and outdated assertions.

**Proposed Fixes:**

1.  **Isolate Mocks:** The primary issue is the lack of proper mocking for the `child_process` module. The fix is to introduce a `vi.mock('child_process', ...)` call at the very top of the test file. This ensures that all shell script executions are intercepted, preventing unintended side effects like network calls (`git pull`) and providing a stable context for assertions. A `beforeEach` hook will be added to provide a default mock implementation for `exec`.

2.  **Correct Assertions:** Several tests are failing because the expected output strings no longer match the actual output from the tool scripts. These will be corrected to reflect the current, correct behavior. For example, the "re-planning" instruction has changed, and the test will be updated to match.

3.  **Validate `escalate_for_external_help` Behavior:** The test for this tool will be updated to pass a sample markdown report and assert that the script correctly prints the report to `stdout` and exits with the specific halt code of `10`.

### 2.2. `escalate_for_external_help` Implementation Gap

The current implementation of this tool is a stub. It does not accept the `markdown_report` parameter as designed, and it exits with a success code (0) instead of a halt code.

**Proposed Fix:**

The script at `.agents/swe_agent/tools/escalate_for_external_help.sh` will be updated to:
1.  Check for the presence of a command-line argument (`$1`). If it is missing, exit with an error.
2.  Print the received argument (the markdown report) directly to standard output.
3.  Exit with a status code of `10`. This specific, non-zero code signals to the calling process that the workflow must halt for human intervention.

### 2.3. Missing Agent Instruction for Escalation

Fixing the `escalate_for_external_help.sh` script is only half the solution. The agent's behavior is driven by its instructions, and the current `get_task.sh` script never explicitly tells the agent *how* or *when* to generate the required markdown report for escalation.

**Proposed Fix:**

The dynamic "nudge" logic within the `DEBUGGING` state of `.agents/swe_agent/tools/get_task.sh` will be updated. A new tier of guidance will be added that triggers when the `debug_attempt_counter` surpasses the threshold for scope reduction.

This new instruction will be explicit:

> "You have made numerous attempts and have been unable to solve the problem. Your new primary goal is to escalate for external help. You MUST generate a comprehensive markdown report detailing the problem, what you've tried, and any relevant error messages. Then, you MUST call the 'escalate_for_external_help' tool with the full markdown report as the 'markdown_report' parameter."

This change ensures that the agent is not only aware of the tool's capability (via its schema) but is also given a clear, actionable instruction to use it correctly at the appropriate time.

### 2.3. Hardcoded Debugging Strategy

Currently, the logic for when to "nudge" the agent with different debugging strategies and when to "unlock" recovery tools is hardcoded within the `get_task.sh` and `request_scope_reduction.sh` scripts. This makes the strategy difficult to tune or adapt.

**Proposed Fix:**

1.  **Create a Configuration File:** A new file, `.agents/swe_agent/swe_agent_config.json`, will be created to store these thresholds.

    ```json
    {
      "debugging_strategy": {
        "hypothesize_max_attempts": 2,
        "instrumentation_max_attempts": 5,
        "unlock_scope_reduction_at": 6,
        "unlock_escalation_at": 10
      }
    }
    ```

2.  **Update Scripts to Read from Config:**
    *   `get_task.sh`: Will be modified to use `jq` to read the `hypothesize_max_attempts` and `instrumentation_max_attempts` values from the new config file to determine which guidance to provide.
    *   `request_scope_reduction.sh` and `escalate_for_external_help.sh`: Will be modified to read `unlock_scope_reduction_at` and `unlock_escalation_at` respectively to determine if the tool is locked.

This change will centralize the agent's strategic parameters, making them transparent and easily modifiable without altering the core script logic.
