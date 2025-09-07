# Feature Plan: Fix SWE Agent Discrepancies and Bugs

This plan addresses bugs and implementation discrepancies identified during a review of the SWE Agent against its design document (`docs/designs/swe-agent-workflow.md`). The goal is to improve the agent's reliability and fully align it with the specified architecture.


## Phase 1: Core Bug Fixes and Feature Implementation

### Pull Request #1: Fix Finalization Bug Preventing Workflow Completion [DONE] 2c5720ee

- **PR Title:** `fix(swe-agent): Save commit hash during finalization to prevent stall`
- **Summary:** This PR fixes a critical bug where the agent stalls after squashing commits. The `submit_work` tool correctly verifies the squashed commit but fails to save the commit hash to the orchestration state. The `get_task` tool requires this hash to proceed to the next step (updating the master plan). This change ensures the hash is saved, allowing the workflow to complete.
- **Verification Plan:**
  - A new test file, `.agents/swe_agent/tests/submit_work_finalization.test.sh`, will be created.
  - The test will set the orchestration state to `AWAITING_FINALIZATION`.
  - It will mock the `git` command to simulate a successful squash verification.
  - It will call `submit_work.sh` with a mock commit hash.
  - **Assertion:** The test will verify that `ORCHESTRATION_STATE.json` is updated to contain `"last_commit_hash": "mock_hash"`.
- **Planned Implementation Tasks:**
  - [ ] Task: Create a new test file `.agents/swe_agent/tests/submit_work_finalization.test.sh` that reproduces the bug by asserting the `last_commit_hash` is not written to the state file.
  - [ ] Task: Modify the `handle_awaiting_finalization_state` function in `.agents/swe_agent/tools/submit_work.sh`.
  - [ ] Task: Inside this function, after the squash is successfully verified, add a call to `write_state "last_commit_hash" "$commit_hash"` to save the verified hash.
  - [ ] Task: Run the new test and ensure it passes.

### Pull Request #2: Implement Dynamic "Nudge" Guidance in Debugging [DONE] 930815ca

- **PR Title:** `feat(swe-agent): Implement dynamic nudge guidance for debugging`
- **Summary:** This PR implements the "Nudge and Unlock" protocol as described in the design document. Currently, the agent receives the same static advice regardless of how many times it has failed. This change introduces dynamic guidance that changes based on the `debug_attempt_counter`, providing more sophisticated strategic advice to the agent.
- **Verification Plan:**
  - The existing test file `.agents/swe_agent/tests/get_task_debugging.test.sh` will be modified.
  - The test will be expanded into three distinct cases, each setting a different `debug_attempt_counter` in `ORCHESTRATION_STATE.json` (e.g., 1, 4, 7).
  - **Assertion:** Each test case will assert that the "Strategic guidance" output from `get_task.sh` matches the expected nudge for that attempt count, as specified in the design doc (e.g., "Hypothesize & Fix," "Use Instrumentation," "Conclude the task is too complex").
- **Planned Implementation Tasks:**
  - [ ] Task: Modify `.agents/swe_agent/tests/get_task_debugging.test.sh` to include separate tests for each "nudge" level, asserting the specific guidance text is present for each.
  - [ ] Task: Modify the `DEBUGGING` state logic in `.agents/swe_agent/tools/get_task.sh`.
  - [ ] Task: Replace the current static guidance `echo` statement with a series of `if/elif/else` blocks that check the value of `$debug_attempt_counter`.
  - [ ] Task: Each block will `echo` the specific strategic guidance corresponding to the attempt count range defined in the design document.
  - [ ] Task: Run the updated tests to ensure all guidance levels are correctly displayed.

### Pull Request #3: Align Stale Session Cleanup with Design Specification

- **PR Title:** `fix(swe-agent): Align stale session cleanup with design`
- **Summary:** This PR corrects a deviation from the design doc. The design specifies that if the agent starts and finds an `ACTIVE_PR.json` where all tasks are `DONE`, it should be treated as a stale artifact, deleted, and the agent should re-initialize from the master plan. The current implementation incorrectly transitions to the `CODE_REVIEW` phase. This change implements the intended "delete and re-initialize" behavior.
- **Verification Plan:**
  - A new test file, `.agents/swe_agent/tests/get_task_stale_session.test.sh`, will be created.
  - The test will create a fixture for `ACTIVE_PR.json` where all tasks have their `status` set to `DONE`.
  - It will then call `get_task.sh`.
  - **Assertion 1:** The test will assert that the `ACTIVE_PR.json` file has been deleted.
  - **Assertion 2:** The test will assert that the output of `get_task.sh` is the standard initialization instruction, prompting the agent to read the master plan.
- **Planned Implementation Tasks:**
  - [ ] Task: Create the new test file `.agents/swe_agent/tests/get_task_stale_session.test.sh` with a test case that sets up a completed `ACTIVE_PR.json` and asserts for the file's deletion and the correct instructional output.
  - [ ] Task: Modify `.agents/swe_agent/tools/get_task.sh` to add a new check at the beginning of the script.
  - [ ] Task: This check will use `jq` to determine if `ACTIVE_PR.json` exists and if all `.tasks[].status` are `DONE`.
  - [ ] Task: If the condition is true, the script will execute `rm ACTIVE_PR.json`. The script will then proceed, and because the file is now missing, it will naturally fall through to the initialization logic and return the correct instruction.
  - [ ] Task: Run the new test and ensure it passes.
