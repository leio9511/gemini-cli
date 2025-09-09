# Design: SWE Agent Orchestration Integration Test


**Status:** PROPOSED

## References

-   **Design Doc:** @docs/designs/swe-agent-workflow.md
-   **Strategy Doc:** @docs/designs/swe-agent-testing-strategy.md

## Context

The current test suite for the SWE Agent consists of a series of shell scripts (`*.test.sh`). These tests have proven to be brittle and difficult to maintain for several reasons:
- They test implementation details rather than the agent's core behavior.
- They are sensitive to the shell execution context, leading to flaky failures related to the current working directory.
- They do not provide a clear, high-level view of the agent's primary function: orchestrating a complex, stateful workflow.


The core design of the SWE Agent is a state machine. The "state" is the combination of `ACTIVE_PR.json` and `ORCHESTRATION_STATE.json`. The tools (`get_task` and `submit_work`) are the deterministic transition functions.

This plan proposes replacing the existing brittle shell-script-based tests with a single, comprehensive integration test. As outlined in the SWE Agent Testing Strategy, this test serves as the critical middle tier of the testing pyramid. Its primary goal is to validate the integrity of the orchestration state machine and the contracts between the tools, not to test the implementation details of individual scripts.

## Scope and Boundaries (Non-Goals)

This integration test is designed to be the core of our automated testing, but it is not intended to cover all testing needs.

-   **Unit Testing:** This test suite will not validate the internal logic of every helper function. Pure, deterministic helper functions should be tested with their own dedicated, fast-running unit tests as per Tier 1 of the testing strategy.

-   **End-to-End (E2E) Validation:** This test suite validates the *mechanism* of the orchestrator, not the *quality* of the agent's output. It will mock external processes like `git` and `npm` commands and will not actually run the agent's generated code. Verifying that the agent can successfully complete a real-world task from start to finish is the responsibility of Tier 3, Manual/E2E testing.




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
  "status": "INITIALIZING | CREATING_BRANCH | EXECUTING_TDD | DEBUGGING | REPLANNING | CODE_REVIEW | AWAITING_FINALIZATION | FINALIZE_COMPLETE | PLAN_UPDATED | MERGING_BRANCH | HALTED",
  "debug_attempt_counter": "number (optional)",
  "last_commit_hash": "string (optional)",
  "current_pr_branch": "string (optional)",
  "last_error": "string (optional)"
}
```

### Requirement 1: Bug Fix Implementation

A bug was discovered during the analysis for this plan. The `submit_work.sh` script does not correctly mark successful `GREEN` TDD steps as `DONE`. This will be fixed as part of the implementation.

1.  **Task: Fix Bug in `submit_work` for Green Steps**
    -   **Context:** The current implementation of `submit_work.sh` only contains logic to update a TDD step's status to `DONE` within the `NEEDS_ANALYSIS` flow. It is missing this logic for the standard `PASS` expectation flow.
    -   **Implementation:** Add logic to `submit_work.sh`. After a test with `expectation: "PASS"` succeeds (including the `preflight` check), the script must find the current `TODO` TDD step in `ACTIVE_PR.json` and update its status to `DONE`.
    -   **Verification:** The test case for the `EXECUTING_TDD` (Green Step) transition will now correctly and fully test for this behavior.

### Requirement 2: Test Infrastructure Setup

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


### Requirement 3: State Transition Test Implementation

This phase involves writing a series of tests, each verifying a specific state transition in the orchestration flow. The tests will follow a "Given-When-Then" structure.

#### 1. Initialization and Session Management

-   **Transition:** Stale Session Cleanup
    -   **Given:** A valid `ACTIVE_PR.json` exists, but all tasks are `DONE`.
        -   **`ORCHESTRATION_STATE.json`:** Does not exist.
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [ { "taskName": "Old task", "status": "DONE" } ]
            }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The stale `ACTIVE_PR.json` should be deleted, and the output should be the standard initialization instruction.

-   **Transition:** Interrupted Session Resumption
    -   **Given:** A session was interrupted mid-task.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [
                { "taskName": "First task", "status": "DONE" },
                { "taskName": "Second task", "description": "Do the second thing", "status": "TODO" }
              ]
            }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The output should be the description of the "Second task".

-   **Transition:** `[NO STATE]` -> `INITIALIZING`
    -   **Given:** No `ACTIVE_PR.json` or `ORCHESTRATION_STATE.json` exists.
        -   **`ORCHESTRATION_STATE.json`:** Does not exist.
        -   **`ACTIVE_PR.json`:** Does not exist.
    -   **When:** `get_task` is called.
    -   **Then:** The output should be the detailed initialization instruction, including the full JSON schema.

-   **Transition:** `INITIALIZING` -> `CREATING_BRANCH`
    -   **Given:** The agent has just created the `ACTIVE_PR.json` file.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "INITIALIZING" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "masterPlanPath": "docs/designs/swe-agent-workflow.md",
              "prTitle": "feat: Implement New Feature",
              "summary": "This PR implements a new feature based on the plan.",
              "verificationPlan": "All new logic is covered by tests.",
              "tasks": [ { "taskName": "First task", "status": "TODO", "tdd_steps": [] } ]
            }
            ```
    -   **When:** `submit_work` is called (simulating the agent creating `ACTIVE_PR.json`).
-   **Then:** The new state in `ORCHESTRATION_STATE.json` should be `CREATING_BRANCH`.

-   **Transition:** `INITIALIZING` -> `HALTED` (Malformed JSON)
    -   **Given:** The agent has created a malformed `ACTIVE_PR.json` file.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "INITIALIZING" }
            ```
        -   **`ACTIVE_PR.json`:** `{"tasks": "this is not an array"}` (Invalid schema)
    -   **When:** `submit_work` is called.
    -   **Then:**
        -   The state should transition to `HALTED`.
        -   `last_error` should contain a message about the schema validation failure.
        -   The tool should exit with a non-zero code.

-   **Transition:** `CREATING_BRANCH` -> `EXECUTING_TDD`
    -   **Given:** The orchestrator is ready to create the feature branch.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "CREATING_BRANCH" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            { "prTitle": "feat: Implement New Feature" }
            ```
    -   **When:** `get_task` is called.
    -   **Then:**
        -   The orchestrator should execute `git checkout main`, `git pull`, and `git checkout -b feat/implement-new-feature`. (This will be verified via mock).
        -   The new state in `ORCHESTRATION_STATE.json` should be `EXECUTING_TDD`.
        -   The `current_pr_branch` field in `ORCHESTRATION_STATE.json` should be set to `feat/implement-new-feature`.
 
#### 2. TDD Cycle & Preflight Checks


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

-   **Transition:** `EXECUTING_TDD` (Red Step) -> Returns `NEEDS_ANALYSIS`
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
    -   **Then:** The output should contain the string `NEEDS_ANALYSIS`, and the orchestrator state should remain `EXECUTING_TDD`.

-   **Transition:** Awaiting Analysis -> `EXECUTING_TDD`
    -   **Given:** The tool has returned `NEEDS_ANALYSIS`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:** (The `RED` step is still `TODO`)
            ```json
            {
              "tasks": [ { "taskName": "...", "status": "TODO", "tdd_steps": [ { "type": "RED", "status": "TODO" } ] } ]
            }
            ```
    -   **When:** `submit_work` is called with `analysis_decision: "SUCCESS"`.
    -   **Then:** The TDD step's status should be `DONE`, and the state should remain `EXECUTING_TDD`.

-   **Transition:** Awaiting Analysis -> `DEBUGGING` (Analysis Failure)
    -   **Given:** The tool has returned `NEEDS_ANALYSIS` for a `RED` TDD step.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:** (The `RED` step is still `TODO`)
            ```json
            {
              "tasks": [ { "taskName": "...", "status": "TODO", "tdd_steps": [ { "type": "RED", "status": "TODO" } ] } ]
            }
            ```
    -   **When:** The agent determines the test failed for an unexpected reason and calls `submit_work` with `analysis_decision: "FAILURE"`.
    -   **Then:** 
        - The state should transition to `DEBUGGING`.
        - `debug_attempt_counter` should be set to 1.
        - `last_error` should be populated.

-   **Transition:** `EXECUTING_TDD` (Green Step) -> `EXECUTING_TDD` (with Safety Checkpoint)
    -   **Given:** A `GREEN` step has just been completed.
        -   **`ORCHESTRATION_STATE.json`:** `{ "status": "EXECUTING_TDD" }`
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [ { "tdd_steps": [ { "type": "GREEN", "status": "DONE" } ] } ]
            }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The output should be the instruction to create a safety checkpoint commit.


-   **Transition:** `EXECUTING_TDD` (Successful `PASS`) -> Preflight Check Triggered
    -   **Given:** State is `EXECUTING_TDD`, expectation is `PASS`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [ { "taskName": "...", "status": "TODO", "tdd_steps": [ { "type": "GREEN", "status": "TODO" } ] } ]
            }
            ```
    -   **When:** `submit_work` is called with a command that exits 0.
    -   **Then:** The `npm run preflight` command should be executed by the tool. (This will be verified by mocking the `npm` command).

-   **Transition:** `EXECUTING_TDD` (Failed `preflight`) -> `DEBUGGING`
    -   **Given:** State is `EXECUTING_TDD`, expectation is `PASS`, and the main test command succeeds.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [ { "taskName": "...", "status": "TODO", "tdd_steps": [ { "type": "GREEN", "status": "TODO" } ] } ]
            }
            ```
    -   **When:** `submit_work` is called, but the subsequent `preflight` check fails.
    -   **Then:**
        -   The new state in `ORCHESTRATION_STATE.json` should be `DEBUGGING`.
        -   `debug_attempt_counter` should be 1.
        -   `last_error` should contain the verbatim output from the failed preflight check.



#### 3. Code Review Cycle


-   **Transition:** `EXECUTING_TDD` (All Tasks Done) -> `CODE_REVIEW` (Review is Invoked)
    -   **Given:** State is `EXECUTING_TDD`, and all tasks in `ACTIVE_PR.json` are `DONE`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "EXECUTING_TDD" }
            ```
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "masterPlanPath": "...",
              "tasks": [ { "taskName": "Final task", "status": "DONE", "tdd_steps": [ { "status": "DONE" } ] } ]
            }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The orchestrator should execute the `request_code_review.sh` script. (This will be verified by mocking `child_process.execSync`). The subsequent state transition depends on the mocked output of this script, as described in the following tests.

-   **Transition:** `CODE_REVIEW` (Review Approved) -> `AWAITING_FINALIZATION`
    -   **Given:** The orchestrator is in the `CODE_REVIEW` state and the mocked output of `request_code_review.sh` is a JSON object with an empty `findings` array.
        -   **`ORCHESTRATION_STATE.json`:** `{ "status": "CODE_REVIEW" }`
    -   **When:** `get_task` is called (triggering the review).
    -   **Then:** The new state in `ORCHESTRATION_STATE.json` should be `AWAITING_FINALIZATION`.

-   **Transition:** `CODE_REVIEW` (Review Has Findings) -> `EXECUTING_TDD`
    -   **Given:** The orchestrator is in the `CODE_REVIEW` state and the mocked output of `request_code_review.sh` contains findings.
        -   **`ORCHESTRATION_STATE.json`:** `{ "status": "CODE_REVIEW" }`
        -   **Mocked `request_code_review.sh` output:**
            ```json
            {
              "findings": [ { "description": "New task from review" } ]
            }
            ```
    -   **When:** `get_task` is called (triggering the review).
    -   **Then:**
        -   The new state in `ORCHESTRATION_STATE.json` should be `EXECUTING_TDD`.
        -   A new task corresponding to the finding should be added to `ACTIVE_PR.json`.

-   **Transition:** `EXECUTING_TDD` (Fix Submitted) -> `CODE_REVIEW` (Re-review)
    -   **Given:** The agent has just submitted a fix for a code review task.
        -   **`ORCHESTRATION_STATE.json`:** `{ "status": "EXECUTING_TDD" }`
        -   **`ACTIVE_PR.json`:**
            ```json
            {
              "tasks": [
                { "taskName": "Original task", "status": "DONE" },
                { "taskName": "Address code review feedback: ...", "status": "TODO", "tdd_steps": [ { "status": "TODO" } ] }
              ]
            }
            ```
    -   **When:** `submit_work` is called for the fix, and it passes the `preflight` check.
    -   **Then:** The state in `ORCHESTRATION_STATE.json` should transition back to `CODE_REVIEW`.


#### 4. Debugging and Recovery Cycle

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
    -   **Then:**
        -   The new state in `ORCHESTRATION_STATE.json` should be `DEBUGGING`.
        -   `debug_attempt_counter` should be 1.
        -   `last_error` should be populated with the command's output.

-   **Transition:** `DEBUGGING` -> Get Debugging Guidance
    -   **Given:** State is `DEBUGGING` with `debug_attempt_counter: 1`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "DEBUGGING", "debug_attempt_counter": 1, "last_error": "Test failed unexpectedly" }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The output should contain the error log and the "Hypothesize & Fix" guidance.

-   **Transition:** `DEBUGGING` -> `EXECUTING_TDD` (Successful Fix)
    -   **Given:** State is `DEBUGGING`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "DEBUGGING", "debug_attempt_counter": 2, "last_error": "Some previous error" }
            ```
    -   **When:** The agent submits a fix that passes both the original test command and the subsequent `preflight` check.
    -   **Then:** 
        - The state should transition from `DEBUGGING` back to `EXECUTING_TDD`.
        - The `debug_attempt_counter` and `last_error` fields should be cleared.


-   **Transition:** `DEBUGGING` -> Tool is Locked (Scope Reduction)
    -   **Given:** State is `DEBUGGING` with `debug_attempt_counter: 1`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "DEBUGGING", "debug_attempt_counter": 1 }
            ```
    -   **When:** `request_scope_reduction` is called.
    -   **Then:** The tool should exit with an error, indicating it is locked.

-   **Transition:** `DEBUGGING` -> Tool is Locked (Escalate)
    -   **Given:** State is `DEBUGGING` with `debug_attempt_counter: 1`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "DEBUGGING", "debug_attempt_counter": 1 }
            ```
    -   **When:** `escalate_for_external_help` is called.
    -   **Then:** The tool should exit with an error, indicating it is locked.

-   **Transition:** `REPLANNING` -> `EXECUTING_TDD`
    -   **Given:** State is `REPLANNING` and the agent has created a new plan.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "REPLANNING", "last_error": "Final error" }
            ```
    -   **When:** The agent submits an updated `ACTIVE_PR.json` with a new, more granular plan.
    -   **Then:** 
        - The state should transition from `REPLANNING` back to `EXECUTING_TDD`.
        - The `last_error` field should be cleared.


-   **Transition:** `DEBUGGING` -> `REPLANNING`
    -   **Given:** State is `DEBUGGING` with `debug_attempt_counter` high enough to unlock the tool (e.g., 6).
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "DEBUGGING", "debug_attempt_counter": 6, "last_error": "Final error" }
            ```
    -   **When:** `request_scope_reduction` is called.
    -   **Then:**
        -   The state in `ORCHESTRATION_STATE.json` should be `REPLANNING`.
        -   The `git reset --hard HEAD` command should be executed (verified via mock).

-   **Transition:** `REPLANNING` -> Get Re-planning Instruction
    -   **Given:** State is `REPLANNING`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "REPLANNING", "last_error": "Final error" }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The output should be the re-planning instruction, populated with the original task goal and the `last_error`.

-   **Transition:** `DEBUGGING` -> Escalation
    -   **Given:** State is `DEBUGGING` with `debug_attempt_counter` high enough to unlock the tool.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "DEBUGGING", "debug_attempt_counter": 10, "last_error": "Cannot solve this" }
            ```
    -   **When:** `escalate_for_external_help` is called with a markdown report.
    -   **Then:**
        -   The tool's output should contain the exact markdown report.
        -   The tool should exit with a specific non-zero code to signal a halt.






#### 5. Finalization and Automated Git Workflow

-   **Transition:** `CODE_REVIEW` (Approved) -> `AWAITING_FINALIZATION`
    -   **Given:** State is `CODE_REVIEW`, and the code review agent returns no findings.
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
    -   **When:** `submit_work` is called after the agent has created the squashed commit.
    -   **Then:**
        -   The `submit_work` tool should verify the commit by executing `git rev-list --count main..HEAD` and checking that the result is `1`. (This will be verified via mock).
        -   The new state should be `FINALIZE_COMPLETE`, and `last_commit_hash` should be saved.

-   **Transition:** `FINALIZE_COMPLETE` -> Get "Update Plan" Instruction
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

-   **Transition:** `FINALIZE_COMPLETE` -> `PLAN_UPDATED`
    -   **Given:** State is `FINALIZE_COMPLETE`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "FINALIZE_COMPLETE" }
            ```
    -   **When:** `submit_work` is called (simulating plan update).
    -   **Then:** The state should transition to `PLAN_UPDATED`.
 
-   **Transition:** `PLAN_UPDATED` -> `MERGING_BRANCH`
    -   **Given:** State is `PLAN_UPDATED`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "PLAN_UPDATED" }
            ```
    -   **When:** `get_task` is called.
    -   **Then:** The state should transition to `MERGING_BRANCH`.

-   **Transition:** `MERGING_BRANCH` (Ready to Merge) -> `INITIALIZING` (Successful Merge)
    -   **Given:** State is `MERGING_BRANCH` and the feature branch can be merged cleanly.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "MERGING_BRANCH", "current_pr_branch": "feat/my-feature" }
            ```
    -   **When:** `get_task` is called.
    -   **Then:**
        -   The orchestrator should execute `git checkout main`, `git pull`, `git merge --no-ff feat/my-feature`, and `git branch -d feat/my-feature`. (Verified via mock).
        -   The `ACTIVE_PR.json` file should be deleted.
        -   The state should reset to `INITIALIZING`.
        -   The `current_pr_branch` field should be cleared.

-   **Transition:** `MERGING_BRANCH` -> `HALTED` (Merge Conflict)
    -   **Given:** State is `MERGING_BRANCH` and the feature branch has a merge conflict.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "MERGING_BRANCH", "current_pr_branch": "feat/conflicting-feature" }
            ```
    -   **When:** `get_task` is called, and the mocked `git merge` command fails.
    -   **Then:**
        -   The state should transition to `HALTED`.
        -   The output should be a clear error message instructing the user to resolve the conflict manually.
        -   The tool should exit with a non-zero code to stop execution.

-   **Transition:** `HALTED` -> `HALTED` (Terminal State)
    -   **Given:** State is `HALTED`.
        -   **`ORCHESTRATION_STATE.json`:**
            ```json
            { "status": "HALTED", "last_error": "Some critical failure" }
            ```
    -   **When:** `get_task` is called.
    -   **Then:**
        -   The state should remain `HALTED`.
        -   The tool should exit with a non-zero code to prevent further autonomous action.
