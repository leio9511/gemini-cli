# Feature Plan: SWE Agent Orchestration Integration Test

**Reference Design Doc:** @docs/designs/swe-agent-orchestration-test.md

---

This document outlines the Test-Driven Development (TDD) plan to replace the existing brittle shell-script-based tests for the SWE Agent with a single, comprehensive integration test suite. This new suite will validate the integrity of the agent's state machine as defined in the `swe-agent-workflow.md` design document.

**Core TDD Principle for this Plan:**

The existing logic in the SWE Agent's tool scripts (`get_task.sh`, `submit_work.sh`, etc.) may or may not be correct. Therefore, each new test case we write serves as both a validation of the code and a validation of the test itself. The workflow for each state transition will be:

1.  **Write a Failing Test (RED):** Add a test case to `orchestration.integration.test.ts` for a specific state transition.
2.  **Run and Analyze Failure:** Run the test. It is expected to fail. We must analyze the failure to ensure it's failing for the *expected reason* (e.g., the state did not transition correctly, the output was wrong). A failure confirms the test is correctly exercising the code.
3.  **Implement/Fix the Code (GREEN):** Modify the relevant tool script(s) to correctly implement the logic for the state transition.
4.  **Run and Verify Pass:** Run the test again. It should now pass. This confirms the code is now correct according to the specification defined by the test.

This cycle ensures that by the end of the process, we have a reliable test suite and correct application logic.

---

## Phase 1: Test Infrastructure and Foundational Tests

### Pull Request #1: feat(swe-agent): Set up orchestration integration test infrastructure

-   **PR Title:** `feat(swe-agent): Set up orchestration integration test infrastructure`
-   **Summary:** This PR establishes the foundational infrastructure for the new integration test suite. It creates the test file, a simulation helper for running agent tools in a controlled environment, and implements two basic "happy path" tests to prove the infrastructure works. This PR does not aim to fix any bugs but builds the scaffolding for all subsequent testing.
-   **Verification Plan:**
    -   A new file, `.agents/swe_agent/tests/orchestration.integration.test.ts`, will be created.
    -   A `simulateAgentTurn` helper function will be implemented within the test file to manage temporary directories, state files, and tool execution.
    -   The first two test cases from the reference design doc (`[NO STATE]` -> `INITIALIZING` and `INITIALIZING` -> `CREATING_BRANCH`) will be implemented following the Red-Green cycle.
-   **Planned Implementation Tasks:**
    -   [ ] Task: Create the new test file at `.agents/swe_agent/tests/orchestration.integration.test.ts`.
    -   [ ] Task: Implement the `simulateAgentTurn` helper function to handle test setup, execution, and teardown.
    -   [ ] Task: Add a test case for the `[NO STATE]` -> `INITIALIZING` transition.
    -   [ ] Task: Run the test and observe it failing because the initial instruction is not returned.
    -   [ ] Task: Modify `get_task.sh` to ensure it returns the correct initialization instruction when no state files exist.
    -   [ ] Task: Run the test again to confirm it passes.
    -   [ ] Task: Add a test case for the `INITIALIZING` -> `CREATING_BRANCH` transition.
    -   [ ] Task: Run the test and observe it failing because the state does not transition.
    -   [ ] Task: Modify `submit_work.sh` to transition the state to `CREATING_BRANCH` when called in the `INITIALIZING` state.
    -   [ ] Task: Run the test again to confirm it passes.

---

## Phase 2: Core Logic and Bug Fixes

### Pull Request #2: test(swe-agent): Implement TDD cycle and session management tests

-   **PR Title:** `test(swe-agent): Implement TDD cycle and session management tests`
-   **Summary:** This PR implements tests for the core TDD execution loop and session management (stale and interrupted sessions). This includes the critical bug fix identified in the test plan where `GREEN` steps were not being marked as `DONE`.
-   **Verification Plan:**
    -   Implement the test cases for Stale Session Cleanup, Interrupted Session Resumption, and `CREATING_BRANCH` -> `EXECUTING_TDD`.
    -   Implement the test cases for the main TDD cycle: getting a step, submitting a `GREEN` step, submitting a `RED` step (`NEEDS_ANALYSIS`), and resolving the analysis.
    -   The implementation will require fixing the logic in `get_task.sh` for session handling and `submit_work.sh` for correctly marking `GREEN` steps as complete.
-   **Planned Implementation Tasks:**
    -   [ ] Task: Add test case for Stale Session Cleanup.
    -   [ ] Task: Run the test, observe failure (stale `ACTIVE_PR.json` is not deleted).
    -   [ ] Task: Modify `get_task.sh` to correctly identify and delete stale `ACTIVE_PR.json` files.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add test case for Interrupted Session Resumption.
    -   [ ] Task: Run the test, observe failure (correct task is not returned).
    -   [ ] Task: Modify `get_task.sh` to correctly identify and return the next `TODO` task.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add test case for `EXECUTING_TDD` (Green Step) -> `EXECUTING_TDD`.
    -   [ ] Task: Run the test, observe failure (TDD step status is not updated to `DONE`).
    -   [ ] Task: **Fix the bug** in `submit_work.sh` by adding logic to mark the current `TODO` step as `DONE` after a successful `PASS` expectation and `preflight` check.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add and verify tests for all other transitions in the "TDD Cycle & Preflight Checks" section of the reference design doc.

### Pull Request #3: test(swe-agent): Implement debugging and recovery cycle tests

-   **PR Title:** `test(swe-agent): Implement debugging and recovery cycle tests`
-   **Summary:** This PR focuses on the robustness of the agent by implementing tests for all "unhappy paths": the debugging cycle, the re-planning workflow, and the escalation process. It will verify the "nudge and unlock" mechanism for recovery tools.
-   **Verification Plan:**
    -   Implement all test cases outlined in the "Debugging and Recovery Cycle" section of the test design.
    -   This involves writing failing tests and then adjusting `get_task.sh`, `submit_work.sh`, `request_scope_reduction.sh`, and `escalate_for_external_help.sh` to match the specified behavior.
-   **Planned Implementation Tasks:**
    -   [ ] Task: Add test case for `EXECUTING_TDD` -> `DEBUGGING` on unexpected test failure.
    -   [ ] Task: Run the test, observe failure (state does not transition, `last_error` is not populated).
    -   [ ] Task: Modify `submit_work.sh` to correctly transition to `DEBUGGING` and save the error.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add test case for `DEBUGGING` -> Get Debugging Guidance.
    -   [ ] Task: Run the test, observe failure (correct guidance is not provided).
    -   [ ] Task: Modify `get_task.sh` to provide the correct "Hypothesize & Fix" guidance.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add test case for the tool lock (`request_scope_reduction` called too early).
    -   [ ] Task: Run the test, observe failure (tool does not exit with an error).
    -   [ ] Task: Modify `request_scope_reduction.sh` to check the `debug_attempt_counter` and exit if it's below the threshold.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add and verify tests for all other transitions in the "Debugging and Recovery Cycle" section of the reference design doc.

---

## Phase 3: Finalization and Cleanup

### Pull Request #4: test(swe-agent): Implement finalization and merge workflow tests

-   **PR Title:** `test(swe-agent): Implement finalization and merge workflow tests`
-   **Summary:** This PR implements tests for the final phases of the agent's workflow, including the code review loop, squashing commits, updating the master plan, and the automated merge process. It also tests the terminal `HALTED` state.
-   **Verification Plan:**
    -   Implement all test cases outlined in the "Code Review Cycle" and "Finalization and Automated Git Workflow" sections of the test design.
    -   This will validate the final set of state transitions and ensure the agent can cleanly finish a PR and handle merge conflicts gracefully.
-   **Planned Implementation Tasks:**
    -   [ ] Task: Add test case for `EXECUTING_TDD` (All Tasks Done) -> `CODE_REVIEW`.
    -   [ ] Task: Run the test, observe failure (state does not transition).
    -   [ ] Task: Modify `get_task.sh` to transition to `CODE_REVIEW` when all tasks are `DONE`.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add test case for `MERGING_BRANCH` -> `HALTED` on a merge conflict.
    -   [ ] Task: Run the test, observe failure (state does not transition to `HALTED`).
    -   [ ] Task: Modify `get_task.sh` to detect a mocked merge failure and transition to `HALTED`.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add test case for the terminal `HALTED` state to ensure no further action is taken.
    -   [ ] Task: Run the test, observe failure (tool does not exit with a non-zero code).
    -   [ ] Task: Modify `get_task.sh` to check for the `HALTED` state at the beginning and exit immediately.
    -   [ ] Task: Run the test, confirm it passes.
    -   [ ] Task: Add and verify tests for all other transitions in the "Code Review" and "Finalization" sections of the reference design doc.

### Pull Request #5: chore(swe-agent): Remove old shell-based test suite

-   **PR Title:** `chore(swe-agent): Remove old shell-based test suite`
-   **Summary:** Now that the new integration test suite is complete and providing comprehensive coverage, this PR removes the old, brittle, and redundant `*.test.sh` files and updates the project's testing scripts to remove any references to them.
-   **Verification Plan:**
    -   The primary verification is that the `npm run preflight` command (or the project's main test command) still runs successfully and executes the new integration test suite.
    -   A manual check will confirm that all files within `.agents/swe_agent/tests/` have been deleted, except for the new `orchestration.integration.test.ts` and any fixtures it requires.
-   **Planned Implementation Tasks:**
    -   [ ] Task: Delete all `*.test.sh` files from the `.agents/swe_agent/tests/` directory.
    -   [ ] Task: Delete the `run_all_tests.sh` script.
    -   [ ] Task: Inspect `package.json` and any CI configuration files (`.github/workflows/`) to remove any scripts or steps that reference the old test files.
    -   [ ] Task: Run the project's main test command (`npm test` or `npm run preflight`) and ensure it completes successfully, running only the new test suite.
