# Feature Plan: SWE Agent Design Alignment

**Reference Design Doc:** @docs/designs/swe-agent-implementation-alignment.md
**Reference Test Plan:** @docs/designs/swe-agent-orchestration-test.md

This document outlines the plan to address discrepancies found during a review of the SWE Agent's implementation against its design documents. The goal is to align the implementation with the original design, improving reliability and test coverage.

---

## Phase 1: Align Orchestrator Responsibilities

**Goal:** Refactor the orchestration tools to handle deterministic Git operations directly, removing this responsibility from the agent and adhering to the core design principle of separating deterministic actions from agent-based reasoning.

### Pull Request #1: Automate Git operations in orchestrator

- **PR Title:** `refactor(swe-agent): Automate Git operations in orchestrator`
- **Summary:** This PR refactors the SWE agent's orchestration tools to handle Git branch creation and merging directly. This aligns the implementation with the design document, making the workflow more reliable by ensuring deterministic tasks are not handled by the LLM agent.
- **Verification Plan:**
  - The existing integration test suite (`orchestration.integration.test.ts`) will be modified.
  - Tests for the `CREATING_BRANCH` and `MERGING_BRANCH` states will be updated to mock the `git` command and assert that the orchestrator tools execute the correct `git` operations (`checkout -b`, `merge`, etc.) instead of returning natural language instructions.
- **Planned Implementation Tasks:**
  - [ ] **Task 1:** Modify `submit_work.sh` to handle the `CREATING_BRANCH` transition.
    - **Context:** Currently, after `ACTIVE_PR.json` is created, the tool instructs the agent to create a branch.
    - **Change:** The tool itself will execute `git checkout main && git pull && git checkout -b [new-branch-name]` and then transition the state to `EXECUTING_TDD`.
  - [ ] **Task 2:** Modify `get_task.sh` to handle the `MERGING_BRANCH` transition.
    - **Context:** Currently, the tool instructs the agent to merge the completed branch.
    - **Change:** The tool will execute `git checkout main && git pull && git merge --no-ff [branch] && git branch -d [branch]`. On success, it will delete `ACTIVE_PR.json` and reset the state to `INITIALIZING`. On failure, it will transition to the `HALTED` state.
  - [ ] **Task 3:** Update the integration test for the `CREATING_BRANCH` state transition.
    - **Context:** The test currently checks for a natural language prompt.
    - **Change:** The test will be updated to mock the `exec` command and verify that the correct `git checkout -b` command is executed by the tool.
  - [ ] **Task 4:** Update the integration test for the `MERGING_BRANCH` state transition.
    - **Context:** The test currently checks for a natural language prompt.
    - **Change:** The test will be updated to mock the `exec` command and verify that the correct `git merge` and `git branch -d` commands are executed.
  - [ ] **Task 5:** Remove natural language instructions for Git operations from all tool outputs.

---

## Phase 2: Improve Test Coverage

**Goal:** Enhance the integration test suite to cover all specified behaviors, ensuring the implementation is fully verified against the test plan.

### Pull Request #2: Add test for safety checkpoint instruction

- **PR Title:** `test(swe-agent): Add test for safety checkpoint instruction`
- **Summary:** This PR adds a missing integration test to verify that the orchestrator correctly instructs the agent to create a safety checkpoint commit after a successful GREEN or REFACTOR TDD step, as specified in the design and test plan.
- **Verification Plan:**
  - The successful execution of the new test case in the CI/CD pipeline will serve as verification.
- **Planned Implementation Tasks:**
  - [ ] **Task 1:** Add a new test case to `.agents/swe_agent/tests/orchestration.integration.test.ts`.
    - **TDD Steps:**
      1.  **Red:** Create a new test case titled "should instruct to create a safety checkpoint after a green step". In the test setup, create the necessary state files and set the `last_completed_step` in `ORCHESTRATION_STATE.json` to `"GREEN"`. Call `get_task.sh` and assert that its output includes the checkpoint instruction. The test will fail as the state modification logic is not yet in the test.
      2.  **Green:** The implementation for this feature already exists in `get_task.sh`. The test will pass once the setup is correct. The main work is writing the test itself.
      3.  **Refactor:** Ensure the new test is clean and integrates well with the existing suite.
