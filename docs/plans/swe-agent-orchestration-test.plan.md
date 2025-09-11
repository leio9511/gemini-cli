# Feature Plan: SWE Agent Orchestration Test Enhancements

**Reference Design Doc:** @docs/designs/swe-agent-orchestration-test.md

This plan details the process of replacing the existing brittle shell-script-based tests for the SWE Agent with a single, comprehensive integration test suite using Vitest, as outlined in the [original design document](docs/designs/swe-agent-orchestration-test.md). The plan accounts for the existing implementation and focuses on filling the gaps in test coverage.

## Phase 1: Test Infrastructure and Initialization

### Pull Request #1: Refactor and Enhance Test Infrastructure [DONE] 2788e24196c87ccb04116c2b5939cc38075e1a47

- **PR Title:** `refactor(swe-agent): Align orchestration test with design spec`
- **Summary:** This PR aligns the existing test infrastructure with the design specification. It renames the primary integration test file and enhances the `simulateAgentTurn` helper function to support mocking of external commands (e.g., `git`, `npm`). This is a foundational step that enables more complex state transition testing in subsequent PRs.
- **Verification Plan:**
  - All existing tests must pass after the file rename and helper function refactoring.
  - A new, simple test case will be added to verify that the command mocking functionality works as expected.
- **Planned Implementation Tasks:**
  - [ ] Task: Rename `.agents/swe_agent/tests/orchestration.test.ts` to `.agents/swe_agent/tests/orchestration.integration.test.ts`.
  - [ ] Task: Update `.agents/swe_agent/vitest.config.ts` to match the new test file naming convention (`**/*.integration.test.ts`).
  - [ ] Task: Refactor the `simulateAgentTurn` helper in `orchestration.integration.test.ts` to accept an optional `mocks` object, allowing tests to provide mock implementations for shell commands.
  - [ ] Task: Update the `execAsync` call within `simulateAgentTurn` to use the provided mocks if a command matches.
  - [ ] Task: Add a test case to confirm that a mocked command is called instead of the real command.

### Pull Request #2: Add Tests for Initialization and Session Management [DONE] 4f619d88c0bb7b8d51286c01ee1f7872a8cff334

- **PR Title:** `test(swe-agent): Add test coverage for initialization and session management`
- **Summary:** This PR adds comprehensive test coverage for the initial state transitions and session management logic of the SWE Agent orchestrator.
- **Verification Plan:**
  - All newly added test cases must pass.
- **Planned Implementation Tasks:**
  - [ ] Task: Add test case for Stale Session Cleanup.
  - [ ] Task: Add test case for Interrupted Session Resumption.
  - [ ] Task: Add test case for `[NO STATE]` -> `INITIALIZING` transition.
  - [ ] Task: Add test case for `INITIALIZING` -> `CREATING_BRANCH` transition.
  - [ ] Task: Add test case for `INITIALIZING` -> `HALTED` when `ACTIVE_PR.json` is malformed.
  - [ ] Task: Add test case for `CREATING_BRANCH` -> `EXECUTING_TDD` transition.

## Phase 2: Core TDD and Code Review Cycles

### Pull Request #3: Implement Bug Fix and Add Tests for TDD Cycle [DONE] 0aeada92

- **PR Title:** `fix(swe-agent): Ensure green TDD steps are marked as DONE`
- **Summary:** This PR addresses a bug where successful `GREEN` TDD steps were not being marked as `DONE`. It also implements the full suite of integration tests for the core TDD cycle, including preflight checks and the `NEEDS_ANALYSIS` flow.
- **Verification Plan:**
  - The new test case for the `EXECUTING_TDD` (Green Step) transition must verify that the TDD step's status is correctly updated to `DONE`.
  - All other newly added test cases must pass.
- **Planned Implementation Tasks:**
  - [ ] Task: Fix Bug in `submit_work` for Green Steps by adding logic to update the TDD step status to `DONE` after a test with `expectation: "PASS"` succeeds.
  - [ ] Task: Add test case for `EXECUTING_TDD` -> Get Next Step.
  - [ ] Task: Add test case for `EXECUTING_TDD` (Green Step) -> `EXECUTING_TDD` and verify the TDD step status is updated to `DONE`.
  - [ ] Task: Add test case for `EXECUTING_TDD` (Red Step) -> Returns `NEEDS_ANALYSIS`.
  - [ ] Task: Add test case for `Awaiting Analysis` -> `EXECUTING_TDD` when `submit_work` is called with `analysis_decision: "SUCCESS"`.
  - [ ] Task: Add test case for `Awaiting Analysis` -> `DEBUGGING` when `submit_work` is called with `analysis_decision: "FAILURE"`.
  - [ ] Task: Add test case for `EXECUTING_TDD` (Green Step) -> `EXECUTING_TDD` (with Safety Checkpoint).
  - [ ] Task: Add test case to verify `npm run preflight` is triggered on a successful `PASS` expectation in `submit_work`.
  - [ ] Task: Add test case for `EXECUTING_TDD` -> `DEBUGGING` when the `preflight` check fails.

### Pull Request #4: Add Tests for Code Review Cycle [DONE] 958c9905

- **PR Title:** `test(swe-agent): Add test coverage for code review cycle`
- **Summary:** This PR implements integration tests for the code review state transitions. It ensures the orchestrator correctly handles review approval, the creation of new tasks from findings, and the re-review process.
- **Verification Plan:**
  - All newly added test cases must pass.
- **Planned Implementation Tasks:**
  - [ ] Task: Add test case for `EXECUTING_TDD` (All Tasks Done) -> `CODE_REVIEW`.
  - [ ] Task: Add test case for `CODE_REVIEW` (Approved) -> `AWAITING_FINALIZATION`.
  - [ ] Task: Add test case for `CODE_REVIEW` (Has Findings) -> `EXECUTING_TDD`.
  - [ ] Task: Add test case for `EXECUTING_TDD` (Fix Submitted) -> `CODE_REVIEW`.

## Phase 3: Debugging, Finalization, and Cleanup

### Pull Request #5: Add Tests for Debugging and Recovery Cycle

- **PR Title:** `test(swe-agent): Add test coverage for debugging and recovery`
- **Summary:** This PR implements integration tests for the debugging and recovery flows. It covers the transitions for successful fixes, re-planning after repeated failures, and escalation.
- **Verification Plan:**
  - All newly added test cases must pass.
- **Planned Implementation Tasks:**
  - [ ] Task: Add test case for `EXECUTING_TDD` -> `DEBUGGING` on unexpected failure.
  - [ ] Task: Add test case for `DEBUGGING` -> Get Debugging Guidance.
  - [ ] Task: Add test case for `DEBUGGING` -> `EXECUTING_TDD` after a successful fix is submitted.
  - [ ] Task: Add test case to verify `request_scope_reduction` is locked when `debug_attempt_counter` is low.
  - [ ] Task: Add test case to verify `escalate_for_external_help` is locked when `debug_attempt_counter` is low.
  - [ ] Task: Add test case for `DEBUGGING` -> `REPLANNING` when `request_scope_reduction` is called after enough failed attempts.
  - [ ] Task: Add test case for `REPLANNING` -> Get Re-planning Instruction when `get_task` is called.
  - [ ] Task: Add test case for `REPLANNING` -> `EXECUTING_TDD` when an updated `ACTIVE_PR.json` is submitted.
  - [ ] Task: Add test case for `DEBUGGING` -> Escalation when `escalate_for_external_help` is called.

### Pull Request #6: Add Tests for Finalization and Cleanup

- **PR Title:** `test(swe-agent): Add test coverage for finalization and merge workflow`
- **Summary:** This PR completes the test suite by porting the finalization logic tests from `test_finalization.sh` to the Vitest integration test. It also adds coverage for the automated git merge workflow, the terminal `HALTED` state, and removes the now-redundant shell script tests.
- **Verification Plan:**
  - All newly added test cases must pass.
  - The `test_finalization.sh` file must be deleted.
- **Planned Implementation Tasks:**
  - [ ] Task: Port test case from `test_finalization.sh` for `AWAITING_FINALIZATION` -> `FINALIZE_COMPLETE` (verifies squashed commit).
  - [ ] Task: Port test case from `test_finalization.sh` for `FINALIZE_COMPLETE` -> Get "Update Plan" Instruction.
  - [ ] Task: Add test case for `FINALIZE_COMPLETE` -> `PLAN_UPDATED`.
  - [ ] Task: Add test case for `PLAN_UPDATED` -> `MERGING_BRANCH`.
  - [ ] Task: Add test case for `MERGING_BRANCH` -> `INITIALIZING` after a successful merge.
  - [ ] Task: Add test case for `MERGING_BRANCH` -> `HALTED` on merge conflict.
  - [ ] Task: Add test case to verify `HALTED` is a terminal state.
  - [ ] Task: Delete `.agents/swe_agent/tests/test_finalization.sh`.
