# Plan: SWE Agent Orchestration Integration Test


**Status:** PROPOSED

## References

-   **Design Doc:** @docs/designs/swe-agent-workflow.md

## Context

The current test suite for the SWE Agent consists of a series of shell scripts (`*.test.sh`). These tests have proven to be brittle and difficult to maintain for several reasons:
- They test implementation details rather than the agent's core behavior.
- They are sensitive to the shell execution context, leading to flaky failures related to the current working directory.
- They do not provide a clear, high-level view of the agent's primary function: orchestrating a complex, stateful workflow.

The core design of the SWE Agent is a state machine. The "state" is the combination of `ACTIVE_PR.json` and `ORCHESTRATION_STATE.json`. The tools (`get_task` and `submit_work`) are the deterministic transition functions.

This plan proposes replacing the existing unit tests with a single, comprehensive integration test that validates the integrity of this state machine.

## Plan

### State File Schemas

The orchestration flow is managed by two primary state files. The tests will verify the transitions between states by manipulating and asserting the contents of these files.

#### `ACTIVE_PR.json`

This file represents the agent's current engineering task.

```json
{
  "masterPlanPath": "string",
  "prTitle": "string",
  "summary": "string",
  "verificationPlan": "string",
  "tasks": [
    {
      "taskName": "string",
      "status": "TODO | IN_PROGRESS | DONE | ERROR",
      "tdd_steps": [
        {
          "type": "RED | GREEN | REFACTOR",
          "description": "string",
          "status": "TODO | DONE"
        }
      ]
    }
  ]
}
```

#### `ORCHESTRATION_STATE.json`

This file tracks the live operational state of the workflow.

```json
{
  "status": "INITIALIZING | EXECUTING_TDD | DEBUGGING | NEEDS_ANALYSIS | CODE_REVIEW | AWAITING_FINALIZATION | FINALIZE_COMPLETE",
  "debug_attempt_counter": "number (optional)",
  "last_commit_hash": "string (optional)"
}
```

### Phase 1: Test Infrastructure Setup

The first step is to create the necessary file and a helper function to simulate the agent's environment and actions within a controlled Vitest context.

1.  **Task: Create Integration Test File**
    - A new file will be created at `.agents/swe_agent/tests/orchestration.integration.test.ts`.

2.  **Task: Implement Test Environment Simulator**
    - A helper function, `simulateAgentTurn`, will be created inside the test file. Its responsibilities will be:
      - Programmatically create a temporary directory for each test case using Node.js's `fs` module.
      - Accept an initial state object (representing `ACTIVE_PR.json` and `ORCHESTRATION_STATE.json`) as an argument.
      - Write the initial state to the corresponding JSON files within the temporary directory.
      - Execute a specified tool script (`get_task.sh` or `submit_work.sh`) using `child_process.execSync`, ensuring the `cwd` is set to the temporary directory.
      - Read the resulting state from the JSON files and capture the script's `stdout`.
      - Return an object containing the `finalState` and `output` for assertions.
      - Clean up the temporary directory after the test completes.

### Phase 2: State Transition Test Implementation

This phase involves writing a series of tests, each one verifying a specific state transition in the orchestration flow. The tests will follow a "Given-When-Then" structure.

#### 1. Initialization Flow


-   **Transition:** `[NO STATE]` -> `INITIALIZING`
    -   **Given:** No `ACTIVE_PR.json` or `ORCHESTRATION_STATE.json` exists.
        -   **`ORCHESTRATION_STATE.json`:** Does not exist.
        -   **`ACTIVE_PR.json`:** Does not exist.
    -   **When:** `get_task` is called.
    -   **Then:** The output should be the detailed initialization instruction, including the full JSON schema.

-   **Transition:** `INITIALIZING` -> `EXECUTING_TDD`
    -   **Given:** The agent has just created the `ACTIVE_PR.json` file.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "INITIALIZING" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "masterPlanPath": "docs/plans/some-plan.md",
              "prTitle": "feat: Implement New Feature",
              "tasks": [ { "taskName": "First task", "status": "TODO", "tdd_steps": [] } ]
            }
            ```
    -   **When:** `submit_work` is called (simulating the agent creating `ACTIVE_PR.json`).
    -   **Then:** The new state in `ORCHESTRATION_STATE.json` should be `EXECUTING_TDD`.

#### 2. TDD Cycle


-   **Transition:** `EXECUTING_TDD` -> Get Next Step
    -   **Given:** State is `EXECUTING_TDD` and the first TDD step in `ACTIVE_PR.json` is `TODO`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [
                {
                  "taskName": "Implement the core logic",
                  "status": "TODO",
                  "tdd_steps": [
                    { "type": "RED", "description": "Write a failing test for the core function.", "status": "TODO" }
                  ]
                }
              ]
            }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The output should be the description of that specific TDD step.

-   **Transition:** `EXECUTING_TDD` (Green Step) -> `EXECUTING_TDD`
    -   **Given:** State is `EXECUTING_TDD`, expectation is `PASS`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:** (Note the `RED` step is `DONE` and the `GREEN` step is `TODO`)
            ```json
            {
              "tasks": [
                {
                  "taskName": "Implement the core logic",
                  "status": "TODO",
                  "tdd_steps": [
                    { "type": "RED", "description": "...", "status": "DONE" },
                    { "type": "GREEN", "description": "Implement the function to make the test pass.", "status": "TODO" }
                  ]
                }
              ]
            }
            ```
    -   **When:** `submit_work` is called with a command that exits 0.
    -   **Then:** The corresponding TDD step's status in `ACTIVE_PR.json` should be updated to `DONE`.

-   **Transition:** `EXECUTING_TDD` (Red Step) -> `NEEDS_ANALYSIS`
    -   **Given:** State is `EXECUTING_TDD`, expectation is `FAIL`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [
                { "taskName": "...", "status": "TODO", "tdd_steps": [ { "type": "RED", "status": "TODO" } ] }
              ]
            }
            ```
    -   **When:** `submit_work` is called with a command that exits 1.
    -   **Then:** The output should be `NEEDS_ANALYSIS`, and the state should not change.

-   **Transition:** `NEEDS_ANALYSIS` -> `EXECUTING_TDD`
    -   **Given:** State is `NEEDS_ANALYSIS`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "NEEDS_ANALYSIS" }
            ```
        -   **`ACTIVE_PR.json`:** (The `RED` step is still `TODO`)
            ```json
            {
              "tasks": [
                { "taskName": "...", "status": "TODO", "tdd_steps": [ { "type": "RED", "status": "TODO" } ] }
              ]
            }
            ```
    -   **When:** `submit_work` is called with `analysis_decision: "SUCCESS"`.
    -   **Then:** The TDD step's status should be `DONE`, and the state should return to `EXECUTING_TDD`.

#### 3. Dual File Update Scenarios

-   **Transition:** `CODE_REVIEW` (Feedback) -> `EXECUTING_TDD`
    -   **Given:** State is `CODE_REVIEW`, and a `FINDINGS.json` file with new findings exists.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "CODE_REVIEW" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [ { "taskName": "Original task", "status": "DONE" } ]
            }
            ```
        -   **`FINDINGS.json` (Input file):**
            ```json
            [
              { "taskName": "Address feedback A", "status": "TODO" },
              { "taskName": "Address feedback B", "status": "TODO" }
            ]
            ```
    -   **When:** `submit_work` is called with the path to `FINDINGS.json`.
    -   **Then:**
        -   `ACTIVE_PR.json` should be updated to include the new tasks from the findings.
        -   `ORCHESTRATION_STATE.json` status should be updated to `EXECUTING_TDD`.

-   **Transition:** `NEEDS_ANALYSIS` -> `EXECUTING_TDD` (Enhanced)
    -   **Given:** State is `NEEDS_ANALYSIS`.
        -   **`ORCHESTRATION_STATE.json`:** `{ "status": "NEEDS_ANALYSIS" }`
        -   **`ACTIVE_PR.json`:** `{ "tasks": [ { "tdd_steps": [ { "status": "TODO" } ] } ] }`
    -   **When:** `submit_work` is called with `analysis_decision: "SUCCESS"`.
    -   **Then:**
        -   The TDD step's status in `ACTIVE_PR.json` should be updated to `DONE`.
        -   The `status` in `ORCHESTRATION_STATE.json` should be updated to `EXECUTING_TDD`.

#### 4. Debugging Cycle

-   **Transition:** `EXECUTING_TDD` -> `DEBUGGING`
    -   **Given:** State is `EXECUTING_TDD`, expectation is `PASS`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:** (Agent is attempting a `GREEN` step)
            ```json
            {
              "tasks": [
                { "taskName": "...", "status": "TODO", "tdd_steps": [ { "type": "GREEN", "status": "TODO" } ] }
              ]
            }
            ```
    -   **When:** `submit_work` is called with a command that unexpectedly exits 1.
    -   **Then:** The new state should be `DEBUGGING`, and `debug_attempt_counter` should be 1. An `error.log` file must be created.

-   **Transition:** `DEBUGGING` -> Get Debugging Guidance
    -   **Given:** State is `DEBUGGING` with `debug_attempt_counter: 1`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "DEBUGGING", "debug_attempt_counter": 1 }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The output should contain the error log and the "Hypothesize & Fix" guidance.

#### 5. Code Review & Finalization Flow

-   **Transition:** `EXECUTING_TDD` -> `CODE_REVIEW`
    -   **Given:** State is `EXECUTING_TDD`, and all tasks in `ACTIVE_PR.json` are `DONE`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [ { "taskName": "...", "status": "DONE", "tdd_steps": [ { "status": "DONE" } ] } ]
            }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The new state should be `CODE_REVIEW`, and the output should be `REQUEST_REVIEW`.

-   **Transition:** `CODE_REVIEW` (Approved) -> `AWAITING_FINALIZATION`
    -   **Given:** State is `CODE_REVIEW`, and an empty `FINDINGS.json` file exists.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "CODE_REVIEW" }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The new state should be `AWAITING_FINALIZATION`, and the output should be the squash instruction.

-   **Transition:** `AWAITING_FINALIZATION` -> `FINALIZE_COMPLETE`
    -   **Given:** State is `AWAITING_FINALIZATION`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "AWAITING_FINALIZATION" }
            ```
    -   **When:** `submit_work` is called with a valid squashed commit hash.
    -   **Then:** The new state should be `FINALIZE_COMPLETE`, and `last_commit_hash` should be saved.

-   **Transition:** `FINALIZE_COMPLETE` -> Get Plan Update Instruction
    -   **Given:** State is `FINALIZE_COMPLETE`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "FINALIZE_COMPLETE", "last_commit_hash": "abc1234" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            { "masterPlanPath": "docs/plans/the-plan.md", "tasks": [ { "status": "DONE" } ] }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The output should be the instruction to update the master plan, dynamically populated with the correct file path.

-   **Transition:** `FINALIZE_COMPLETE` -> `INITIALIZING` (Loop)
    -   **Given:** State is `FINALIZE_COMPLETE`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "FINALIZE_COMPLETE" }
            ```
    -   **When:** `submit_work` is called (simulating plan update).
    -   **Then:** The `ACTIVE_PR.json` file should be deleted, and the state should reset to `INITIALIZING`.

### Phase 3: Bug Fix Implementation

A bug was discovered during the analysis for this plan. The `submit_work.sh` script does not correctly mark successful `GREEN` TDD steps as `DONE`. This will be fixed as part of the implementation.

1.  **Task: Fix Bug in `submit_work` for Green Steps**
    -   **Context:** The current implementation of `submit_work.sh` only contains logic to update a TDD step's status to `DONE` within the `NEEDS_ANALYSIS` flow. It is missing this logic for the standard `PASS` expectation flow.
    -   **Implementation:** Add logic to `submit_work.sh`. After a test with `expectation: "PASS"` succeeds (including the `preflight` check), the script must find the current `TODO` TDD step in `ACTIVE_PR.json` and update its status to `DONE`.
    -   **Verification:** The existing test case for the `EXECUTING_TDD` (Green Step) transition will now correctly and fully test for this behavior.


## Pull Request

This work will be completed in a single pull request.

-   **Title:** `test(swe-agent): Replace unit tests with orchestration integration test`
-   **Summary:** This PR removes the brittle shell-based unit tests for the SWE agent and replaces them with a single, robust integration test that validates the agent's core orchestration flow as a state machine. This new approach is more resilient to implementation changes and provides higher confidence in the agent's behavior.
-   **Implementation Tasks:**
    1.  Remove all `*.test.sh` files from `.agents/swe_agent/tests/`.
    2.  Create the new test file `.agents/swe_agent/tests/orchestration.integration.test.ts`.
    3.  Implement the `simulateAgentTurn` test helper function.
    4.  Implement the bug fix for `submit_work.sh` as described in Phase 3.
    5.  Implement a distinct, isolated test case for each state transition defined in Phase 2 of this plan.
