# Feature Plan: Align SWE Agent Implementation with Design

This plan addresses critical deviations between the SWE Agent's design (`@docs/designs/swe-agent-workflow.md`) and the current implementation in `@.agents/swe_agent/`. The goal is to enhance the agent's autonomy and reliability by implementing the full "Tool Engineering" philosophy, focusing on natural language instructions and robust verification workflows.

---

## Phase 1: Restore "Mission Briefer" Capabilities to `get_task.sh`

### Pull Request #1: feat(swe-agent): Implement full instructional logic in get_task [DONE] b361b7ebe4a693a549b2ac9c64ea5ac7d780b96e

- **PR Title:** feat(swe-agent): Implement full instructional logic in get_task
- **Summary:** This PR refactors `get_task.sh` to replace simple command outputs (`CREATE_PR`, `EXECUTE_TASK`) with the detailed, natural-language instructions specified in the design document. It also implements missing session management and TDD safety checkpoint logic to improve workflow robustness.

- **Verification Plan:**
  - All existing tests for `get_task.sh` must continue to pass.
  - New and modified tests in `.agents/swe_agent/tests/` will verify the new instructional outputs and logic.

- **Planned Implementation Tasks:**
  - **Task 1: Implement Initialization Instruction**
    - [ ] **Test (Red):** In `tests/get_task.test.sh`, create a new test case where `ACTIVE_PR.json` does not exist. Assert that the output of `get_task.sh` is the full, multi-line instruction for parsing the master plan and creating the `ACTIVE_PR.json` file, as specified in the design doc.
    - [ ] **Implementation (Green):** In `tools/get_task.sh`, modify the logic that currently outputs `CREATE_PR`. Replace it with an `echo` statement containing the detailed instructional text.

  - **Task 2: Implement TDD Execution Instruction**
    - [ ] **Test (Red):** In `tests/get_task.test.sh`, modify the existing session resumption test. Instead of asserting the output is `EXECUTE_TASK`, assert that the output is a natural language instruction like "Your goal is to complete the next TDD step: [Task Description]", dynamically populated with the details of the next `TODO` task from `ACTIVE_PR.json`.
    - [ ] **Implementation (Green):** In `tools/get_task.sh`, modify the logic that currently outputs `EXECUTE_TASK`. Add logic to parse `ACTIVE_PR.json` using `jq` to find the first task and TDD step with `status: "TODO"` and embed its description in the new instructional output.

  - **Task 3: Implement Stale Session Cleanup**
    - [ ] **Test (Red):** In `tests/get_task.test.sh`, create a new test `test_stale_session_cleanup.sh`. In this test, create an `ACTIVE_PR.json` where all tasks are marked `"DONE"`.
    - [ ] **Assertion:** Assert that after `get_task.sh` runs, the `ACTIVE_PR.json` file is deleted, and the output is the standard initialization instruction from Task 1.
    - [ ] **Implementation (Green):** In `tools/get_task.sh`, add logic at the beginning of the script to check if `ACTIVE_PR.json` exists and if `jq '.tasks[] | select(.status!="DONE")' ACTIVE_PR.json` returns empty. If so, delete the file before proceeding.

  - **Task 4: Implement TDD Safety Checkpoint Instruction**
    - [ ] **Test (Red):** In `tests/get_task.test.sh`, create a new test `test_safety_checkpoint_instruction.sh`. Create an `ACTIVE_PR.json` where the last completed TDD step was of type `GREEN` or `REFACTOR`.
    - [ ] **Assertion:** Assert that the output of `get_task.sh` is an instruction for the agent to create a safety checkpoint commit.
    - [ ] **Implementation (Green):** In `tools/get_task.sh`, add logic to inspect the _last_ completed task. If its type was `GREEN` or `REFACTOR`, return the commit instruction. This requires adding a `last_completed_step` field to `ORCHESTRATION_STATE.json` from the `submit_work.sh` script.

---

## Phase 2: Implement Robust TDD Verification and Tool-Gating

### Pull Request #2: feat(swe-agent): Implement NEEDS_ANALYSIS workflow and tool-gating [DONE] 556cf0a9a5b6b2c9bec27984b4e69ae67c401bfe

- **PR Title:** feat(swe-agent): Implement NEEDS_ANALYSIS workflow and tool-gating
- **Summary:** This PR implements the `NEEDS_ANALYSIS` workflow in `submit_work.sh` to ensure the agent properly verifies failing TDD steps. It also enforces the "Nudge and Unlock" protocol by adding the specified `debug_attempt_counter` lock to the `escalate_for_external_help.sh` tool.

- **Verification Plan:**
  - New tests in `.agents/swe_agent/tests/` will verify the two-step `NEEDS_ANALYSIS` workflow and the tool lock mechanism.

- **Planned Implementation Tasks:**
  - **Task 1: Implement `NEEDS_ANALYSIS` Return Status**
    - [ ] **Test (Red):** In `tests/submit_work.test.sh`, create a new test `test_red_step_needs_analysis.sh`. Call `submit_work.sh` with `expectation="FAIL"` and a command that exits with a non-zero code.
    - [ ] **Assertion:** Assert that the script's standard output is the JSON string `{"status": "NEEDS_ANALYSIS"}`.
    - [ ] **Implementation (Green):** In `tools/submit_work.sh`, modify the logic that handles a `FAIL` expectation. Instead of just transitioning state internally, make it `echo` the specified JSON output.

  - **Task 2: Implement `analysis_decision` Logic**
    - [ ] **Test (Red):** In `tests/submit_work.test.sh`, create a new test `test_analysis_decision_handling.sh`. First, set the state to `AWAITING_ANALYSIS`. Then, call `submit_work.sh` providing the `analysis_decision="SUCCESS"` parameter.
    - [ ] **Assertion:** Assert that the relevant TDD step in `ACTIVE_PR.json` is marked as `DONE` and the state returns to `EXECUTING_TDD`.
    - [ ] **Implementation (Green):** In `tools/submit_work.sh`, add logic to handle the `analysis_decision` parameter. This will require reading the state, and if it is `AWAITING_ANALYSIS`, updating the `ACTIVE_PR.json` and transitioning the state file accordingly.

  - **Task 3: Implement Tool-Gating for Escalation**
    - [ ] **Test (Red):** In `tests/escalate_for_external_help.test.sh`, create a test where the `debug_attempt_counter` in `ORCHESTRATION_STATE.json` is less than the required threshold (e.g., 9).
    - [ ] **Assertion:** Assert that `escalate_for_external_help.sh` exits with a non-zero status and prints an error message indicating the tool is locked.
    - [ ] **Implementation (Green):** In `tools/escalate_for_external_help.sh`, add logic at the beginning of the script to read `ORCHESTRATION_STATE.json`, parse the `debug_attempt_counter`, and exit with an error if the count is below the threshold defined in the design doc.
