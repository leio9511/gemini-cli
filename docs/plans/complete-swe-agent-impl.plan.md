# Feature Plan: Complete SWE Agent Implementation

**Status:** In Progress
**Author:** gemini-agent@google.com
**Date:** 2025-09-06

### 1. Abstract

This document outlines the plan to complete the implementation of the SWE Agent workflow as described in the design document (`@docs/designs/swe-agent-workflow.md`). The current implementation is a partial skeleton. This plan will add the missing core logic for the code review loop, the debugging protocol, and the finalization/loop-continuation phases, following a strict Test-Driven Development (TDD) methodology.

### 2. Background & Problem Statement

A review of the current SWE Agent implementation (`@.agents/swe_agent/`) has revealed several critical gaps when compared to its design document.

1.  **Missing Code Review Mechanism:** The agent can identify when all tasks are complete but lacks the tool and orchestration logic to initiate a code review, process feedback, and loop until approval.
2.  **Incomplete Debugging Protocol:** The "Nudge and Unlock" protocol is not implemented. The orchestrator does not transition to a `DEBUGGING` state on test failure, provide contextual guidance, or lock/unlock the escape-hatch tools (`request_scope_reduction`, `escalate_for_external_help`).
3.  **Missing Finalization Logic:** The workflow for squashing commits, updating the master plan, and cleaning up for the next work cycle is absent.
4.  **Inconsistent File Structure:** Core tool logic scripts (`get_task.sh`, `submit_work.sh`) are located outside the `tools/` directory, which is inconsistent with other agent implementations.

### 3. Goals & Non-Goals

#### Goals

- Implement the full, multi-stage code review loop.
- Implement the "Nudge and Unlock" debugging protocol.
- Implement the finalization and loop continuation logic.
- Refactor the file structure for consistency.
- Ensure the final implementation is robust, reliable, and fully aligned with the design document.

#### Non-Goals

- This plan will not alter the agent's core prompt or the existing tool schemas.
- This plan will not change the functionality of the `code_review_agent` itself.

### 4. Proposed Design

The proposed design is to follow the existing design document (`@docs/designs/swe-agent-workflow.md`) without deviation. The implementation will be broken into three distinct phases, delivered as three separate Pull Requests, to incrementally build out the missing functionality. Each new piece of logic will be added using the TDD flow described in the design document itself.

### 7. Agile Implementation Plan (TDD Flow)

---

#### **Phase 1: Refactor Structure & Implement Code Review Loop**

**Goal:** To refactor the tool scripts into a consistent location and implement the complete, multi-stage code review functionality.

**Pull Request #1: feat(swe-agent): Implement code review loop** [DONE] 1a5280fcac37b7cd8549d4e9b44c3638ed691552

- **Summary:** This PR refactors the tool file structure and implements the logic for the SWE Agent to request code reviews and handle feedback.
- **Verification Plan:** All new logic will be covered by new shell-based unit tests in the `.agents/swe_agent/tests/` directory. The final verification will be running `npm run preflight`.

**Implementation Tasks:**

**Task 1: Refactor tool script locations**

- **TDD Steps:**
  1.  **Red:** N/A. This is a refactoring task.
  2.  **Green:**
      - Move `.agents/swe_agent/get_task.sh` to `.agents/swe_agent/tools/get_task.sh`.
      - Move `.agents/swe_agent/submit_work.sh` to `.agents/swe_agent/tools/submit_work.sh`.
      - Update `.agents/swe_agent/tools/run.sh` to reflect the new locations.
  3.  **Refactor:** Run existing tests to ensure they still pass after the move.

**Task 2: Implement `request_code_review` tool**

- **TDD Steps:**
  1.  **Red:** Create a test that asserts the `discover.sh` script outputs a `request_code_review` tool definition.
  2.  **Green:**
      - Add the `request_code_review` tool definition to `.agents/swe_agent/tools/discover.sh`.
      - Create the script `.agents/swe_agent/tools/request_code_review.sh`, copying the logic from the `swe-v1_agent`'s implementation.
      - Update `.agents/swe_agent/tools/run.sh` to include the new tool.
  3.  **Refactor:** Ensure the script is executable and uses the correct spec file (`ACTIVE_PR.json`).

**Task 3: Implement Code Review Trigger and Feedback Handling**

- **TDD Steps:**
  1.  **Red:** Write a test for `get_task.sh` (as per the design doc) that asserts when all tasks are `DONE`, the agent is instructed to call `request_code_review`.
  2.  **Green:** Implement the `CODE_REVIEW` state transition and instruction logic in `get_task.sh`.
  3.  **Red:** Write a test for `submit_work.sh` that asserts when findings are submitted during the `CODE_REVIEW` state, a new task is added to `ACTIVE_PR.json`.
  4.  **Green:** Implement the feedback handling logic in `submit_work.sh`.

---

#### **Phase 2: Implement the Debugging Protocol**


**Goal:** To implement the "Nudge and Unlock" debugging protocol to make the agent more resilient.

**Pull Request #2: feat(swe-agent): Implement debugging protocol** [DONE] 17cd0065191bc65c4060805dcc0915408ac533ec

- **Summary:** This PR implements the state transitions and dynamic guidance for the debugging workflow.
- **Verification Plan:** New unit tests will be added to verify state transitions and the dynamic "nudge" prompts.

**Implementation Tasks:**

**Task 1: Implement `DEBUGGING` state transition**

- **TDD Steps:**
  1.  **Red:** Write a test for `submit_work.sh` where a `PASS` expectation fails. Assert that `ORCHESTRATION_STATE.json` is updated to `{ "status": "DEBUGGING", "debug_attempt_counter": 1 }`.
  2.  **Green:** Implement the logic in `submit_work.sh` to catch mismatched expectations, update the state, and save the error log.

**Task 2: Implement "Nudge" Guidance**

- **TDD Steps:**
  1.  **Red:** Write a test for `get_task.sh` with the state set to `DEBUGGING`. Assert that the output includes the error log and the correct strategic guidance based on the `debug_attempt_counter`.
  2.  **Green:** Implement the `DEBUGGING` case in `get_task.sh` to provide dynamic guidance.

---

#### **Phase 3: Implement Finalization and Loop Continuation**

**Goal:** To implement the final phase of the workflow, where the work is committed and the agent prepares for the next cycle.

**Pull Request #3: feat(swe-agent): Implement finalization and loop continuation**

- **Summary:** This PR adds the logic for squashing commits, updating the master plan, and resetting the state for the next PR.
- **Verification Plan:** New unit tests will verify the final state transitions and git command instructions.

**Implementation Tasks:**

**Task 1: Implement Finalization Instruction and Verification**

- **TDD Steps:**
  1.  **Red:** Write a test for `get_task.sh` that asserts when a code review is approved, the agent is instructed to squash commits.
  2.  **Green:** Implement the `AWAITING_FINALIZATION` state and instruction logic in `get_task.sh`.
  3.  **Red:** Write a test for `submit_work.sh` to verify it runs the `git rev-list` command to confirm the squash.
  4.  **Green:** Implement the verification logic in `submit_work.sh`.

**Task 2: Implement Master Plan Update and Loop Continuation**

- **TDD Steps:**
  1.  **Red:** Write a test for `get_task.sh` that asserts after finalization is verified, the agent is instructed to update the master plan.
  2.  **Green:** Implement the `FINALIZE_COMPLETE` state and instruction logic in `get_task.sh`.
  3.  **Red:** Write a test for `submit_work.sh` that asserts after the plan is updated, `ACTIVE_PR.json` is deleted and the state resets to `INITIALIZING`.
  4.  **Green:** Implement the final cleanup and loop continuation logic in `submit_work.sh` and `get_task.sh`.
