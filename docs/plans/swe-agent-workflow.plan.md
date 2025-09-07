# Feature Plan: SWE Agent Workflow Implementation

This plan outlines the implementation of the SWE Agent workflow as described in `@docs/designs/swe-agent-workflow.md`. The implementation will follow a Test-Driven Development (TDD) approach, broken down into four distinct phases, each corresponding to a Pull Request.

## Phase 1: Initialization & Session Management

### Pull Request #1: Implement Agent Initialization and Session Handling [DONE] 87149b2c

- **PR Title:** feat(swe-agent): Implement initialization and session management
- **Summary:** This PR lays the foundation for the SWE Agent's orchestration logic. It implements the ability for the agent to start a new work session by creating an `ACTIVE_PR.json` file from a master plan, resume an interrupted session, and clean up stale sessions where all work has been completed. It also introduces the basic state management with `ORCHESTRATION_STATE.json`.
- **Verification Plan:**
  - Create a test suite `.agents/swe_agent/tests/get_task.test.sh`.
  - **Test Case 1:** Verify that when no `ACTIVE_PR.json` exists, `get_task` returns the instruction to create one from the master plan.
  - **Test Case 2:** Verify that if a stale `ACTIVE_PR.json` (all tasks `DONE`) exists, `get_task` deletes it and returns the initialization instruction.
  - **Test Case 3:** Verify that if a valid `ACTIVE_PR.json` exists with pending tasks, `get_task` correctly identifies and returns the next `TODO` task, allowing the session to be resumed.
  - **Test Case 4:** Verify that after the agent creates `ACTIVE_PR.json` and calls `submit_work`, the orchestrator state transitions from `INITIALIZING` to `EXECUTING_TDD`.
  - Create a test suite `.agents/swe_agent/tests/state_management.test.sh`.
  - **Test Case 5:** Verify that state management utilities can correctly read and write to `ORCHESTRATION_STATE.json`, and that `get_task` creates a default state file if one doesn't exist.
- **Planned Implementation Tasks:**
  - [ ] Task: Create directory structure `.agents/swe_agent/tools` and `.agents/swe_agent/tests`.
  - [ ] Task: Write failing test for initial PR creation instruction.
  - [ ] Task: Implement the initial PR creation logic in `get_task.sh`.
  - [ ] Task: Write failing test for stale session cleanup.
  - [ ] Task: Implement the stale session cleanup logic in `get_task.sh`.
  - [ ] Task: Write failing test for basic state file handling.
  - [ ] Task: Implement `read_state` and `write_state` in `utils.sh` and default state creation in `get_task.sh`.
  - [ ] Task: Write failing test for session resumption.
  - [ ] Task: Implement session resumption logic in `get_task.sh`.
  - [ ] Task: Write failing test for `INITIALIZING` to `EXECUTING_TDD` state transition.
  - [ ] Task: Implement the state transition logic in `submit_work.sh`.

## Phase 2: The TDD & Debugging Cycle

### Pull Request #2: Implement the Core TDD and Debugging Loop [DONE] c6ed4707

- **PR Title:** feat(swe-agent): Implement core TDD and debugging cycle
- **Summary:** This PR implements the main development loop for the agent. It includes the verification of passing tests via a `preflight` check, handling of test failures, the `NEEDS_ANALYSIS` flow for expected failures (`RED` step), and the state transitions into and out of the `DEBUGGING` mode. It also introduces the "Nudge" protocol by providing dynamic guidance and error context to the agent.
- **Verification Plan:**
  - Create a test suite `.agents/swe_agent/tests/submit_work.test.sh`.
  - **Test Case 1:** Verify that on a `PASS` expectation, the `npm run preflight` command is executed.
  - **Test Case 2:** Verify that if `preflight` fails, the status is `FAILURE` and the orchestrator state transitions to `DEBUGGING` with `debug_attempt_counter` set to 1.
  - **Test Case 3:** Verify that a `FAIL` expectation correctly returns a `NEEDS_ANALYSIS` status.
  - **Test Case 4:** Verify that a `submit_work` call with `analysis_decision="SUCCESS"` correctly updates the TDD step's status to `DONE` in `ACTIVE_PR.json`.
  - **Test Case 5:** Verify that an unexpected test failure transitions the state to `DEBUGGING` and increments the `debug_attempt_counter`.
  - In `.agents/swe_agent/tests/get_task.test.sh`:
  - **Test Case 6:** Verify that after a `GREEN` or `REFACTOR` step, `get_task` instructs the agent to create a safety checkpoint commit.
  - **Test Case 7:** Verify that when in the `DEBUGGING` state, `get_task` provides the correct "Nudge" guidance based on the `debug_attempt_counter` and includes the verbatim error log from the last failure.
  - Create a test suite `.agents/swe_agent/tests/escalate_for_external_help.test.sh`.
  - **Test Case 8:** Verify that the `escalate_for_external_help` tool is locked and returns an error when the `debug_attempt_counter` is below the required threshold.
- **Planned Implementation Tasks:**
  - [ ] Task: Write failing test for `preflight` verification on `PASS` expectation.
  - [ ] Task: Implement `preflight` check logic in `submit_work.sh`.
  - [ ] Task: Write failing test for `preflight` failure handling.
  - [ ] Task: Implement state transition to `DEBUGGING` on `preflight` failure in `submit_work.sh`.
  - [ ] Task: Write failing test for `RED` step `NEEDS_ANALYSIS` flow.
  - [ ] Task: Implement `NEEDS_ANALYSIS` return logic in `submit_work.sh`.
  - [ ] Task: Write failing test for `analysis_decision` handling.
  - [ ] Task: Implement `analysis_decision` logic in `submit_work.sh` to update `ACTIVE_PR.json`.
  - [ ] Task: Write failing test for safety checkpoint instruction.
  - [ ] Task: Implement safety checkpoint instruction logic in `get_task.sh`.
  - [ ] Task: Write failing test for `DEBUGGING` state transition on unexpected failure.
  - [ ] Task: Implement the `DEBUGGING` state transition logic in `submit_work.sh`.
  - [ ] Task: Write failing test for "Nudge" guidance and error context.
  - [ ] Task: Implement the "Nudge" guidance and error context logic in `get_task.sh`.
  - [ ] Task: Write failing test for `escalate_for_external_help` tool locking.
  - [ ] Task: Implement tool locking logic in `escalate_for_external_help.sh`.

## Phase 3: Escape Hatches & Recovery

### Pull Request #3: Implement Agent Escape Hatches and Recovery Mechanisms [DONE] fb5a5a47

- **PR Title:** feat(swe-agent): Implement escape hatches and recovery tools
- **Summary:** This PR builds the crucial safety and recovery tools for the agent. It implements the `request_scope_reduction` tool, which allows the agent to reset its state and re-plan a complex task. It also implements the final `escalate_for_external_help` tool, which halts the automated workflow and provides a detailed report for human intervention.
- **Verification Plan:**
  - Create a test suite `.agents/swe_agent/tests/request_scope_reduction.test.sh`.
  - **Test Case 1:** Verify that the `request_scope_reduction` tool is locked and returns an error if called before the `debug_attempt_counter` reaches the required threshold.
  - **Test Case 2:** Verify that when the tool is unlocked, it calls `git reset --hard HEAD` and that the `get_task` tool then provides the re-planning instruction, including the original task goal and error log for context.
  - In `.agents/swe_agent/tests/escalate_for_external_help.test.sh`:
  - **Test Case 3:** Verify that when the `escalate_for_external_help` tool is called with a markdown report, it prints the exact report to standard output and exits with a specific non-zero code (e.g., 10) to signal a halt.
- **Planned Implementation Tasks:**
  - [ ] Task: Write failing test for `request_scope_reduction` tool locking.
  - [ ] Task: Implement tool locking logic in `request_scope_reduction.sh`.
  - [ ] Task: Write failing test for scope reduction re-planning and context.
  - [ ] Task: Implement `git reset` and re-planning instruction logic in `request_scope_reduction.sh` and `get_task.sh`.
  - [ ] Task: Write failing test for `escalate_for_external_help` halt signal.
  - [ ] Task: Implement the halt signal logic in `escalate_for_external_help.sh`.

## Phase 4: Code Review & Finalization

### Pull Request #4: Implement Code Review and Finalization Loop [DONE] 4afdba75

- **PR Title:** feat(swe-agent): Implement code review and finalization loop
- **Summary:** This PR completes the workflow by adding the automated code review and PR finalization phases. It implements the logic to trigger a code review agent, handle its feedback by creating new tasks, and loop until the review is clean. It then adds the final steps for the agent to squash its commits, update the master plan, and seamlessly transition to the next PR in the plan.
- **Verification Plan:**
  - In `.agents/swe_agent/tests/get_task.test.sh`:
  - **Test Case 1:** Verify that when all tasks are `DONE`, `get_task` triggers the `CODE_REVIEW` state.
  - **Test Case 2:** Verify the `get_task` script correctly invokes the Code Review Agent via the `gemini` CLI.
  - **Test Case 3:** Verify that after a successful code review, `get_task` provides the instruction to squash commits.
  - **Test Case 4:** Verify that after finalization is verified, `get_task` provides the instruction to update the master plan.
  - **Test Case 5:** Verify that after the plan is updated, `get_task` deletes the old `ACTIVE_PR.json` and returns the `INITIALIZING` instruction for the next PR.
  - In `.agents/swe_agent/tests/submit_work.test.sh`:
  - **Test Case 6:** Verify that when `submit_work` is called in a `CODE_REVIEW` state with findings, a new task is added to `ACTIVE_PR.json` and the state returns to `EXECUTING_TDD`.
  - **Test Case 7:** Verify that when a code review fix is submitted and passes `preflight`, the state transitions back to `CODE_REVIEW`.
  - **Test Case 8:** Verify that `submit_work` correctly calls `git rev-list` to check for a single squashed commit and transitions state appropriately.
- **Planned Implementation Tasks:**
  - [ ] Task: Write failing test for code review trigger.
  - [ ] Task: Implement the code review trigger logic in `get_task.sh`.
  - [ ] Task: Write failing test for handling review feedback.
  - [ ] Task: Implement the feedback handling logic in `submit_work.sh`.
  - [ ] Task: Write failing test for Code Review Agent invocation.
  - [ ] Task: Implement the Code Review Agent invocation logic in `get_task.sh`.
  - [ ] Task: Write failing test for the code review loop (fix -> verify -> re-review).
  - [ ] Task: Implement the code review loop logic in `submit_work.sh`.
  - [ ] Task: Write failing test for finalization (squash) instruction.
  - [ ] Task: Implement the finalization instruction logic in `get_task.sh`.
  - [ ] Task: Write failing test for finalization verification.
  - [ ] Task: Implement finalization verification logic in `submit_work.sh`.
  - [ ] Task: Write failing test for master plan update instruction.
  - [ ] Task: Implement master plan update instruction logic in `get_task.sh`.
  - [ ] Task: Write failing test for loop continuation to the next PR.
  - [ ] Task: Implement loop continuation logic in `get_task.sh` and `submit_work.sh`.
  - [ ] Task: Update agent persona in `swe_agent.prompt.md` and toolset in `settings.json`.
