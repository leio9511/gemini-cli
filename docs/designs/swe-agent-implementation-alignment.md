# Design Doc: SWE Agent Implementation Alignment

**Status:** Proposed
**Author:** gemini-agent@google.com
**Date:** 2025-09-13

### 1. Abstract

This document addresses key discrepancies identified between the implemented SWE Agent workflow and its governing design document, `@docs/designs/swe-agent-workflow.md`. The primary deviations are the delegation of deterministic Git operations to the reasoning-based agent and a minor gap in integration test coverage. The proposed solution is to refactor the orchestration tools to handle all Git commands directly and to add the missing test case, ensuring the implementation fully aligns with the original design's principles of reliability and verifiability.

### 2. Background & Problem Statement

A thorough review of the SWE Agent's implementation (`@.agents/swe_agent/**`) against its design and testing plans revealed two issues:

1.  **Incorrect Delegation of Responsibilities:** The original design mandates a strict separation of concerns: deterministic tasks (like Git operations) should be handled by the orchestrator tools, while reasoning-based tasks are handled by the LLM agent. The current implementation violates this by instructing the agent with natural language to perform branch creation and merging, introducing potential for error and deviating from the core philosophy of using tools for reliable, deterministic actions.

2.  **Incomplete Test Coverage:** The test plan (`@docs/designs/swe-agent-orchestration-test.md`) specifies that the orchestrator should prompt the agent to create a "safety checkpoint commit" after a successful `GREEN` or `REFACTOR` TDD step. While the implementation for this feature exists in `get_task.sh`, the corresponding integration test case to verify this behavior is missing from the test suite.

### 3. Goals & Non-Goals

#### Goals

-   Refactor the orchestration tools (`submit_work.sh`, `get_task.sh`) to execute all Git branch creation and merge commands directly.
-   Remove all natural language prompts that instruct the agent to perform Git operations.
-   Add a new integration test to `orchestration.integration.test.ts` to verify the "safety checkpoint" instruction.
-   Ensure the final implementation is 100% aligned with the state transition table in the `swe-agent-workflow.md` design document.

#### Non-Goals

-   This effort will not introduce any new features to the SWE Agent workflow.
-   This will not change the agent's core TDD loop, only the handling of specific Git-related state transitions.

### 4. Proposed Design

The proposed design involves targeted changes to the orchestration tool scripts and the integration test suite, without altering the agent's core prompt or the overall state machine structure.

#### 4.1. Component 1: Orchestration Tool Refactoring

The logic for Git operations will be moved from agent instructions into direct shell command execution within the tools themselves.

-   **`submit_work.sh` (Handling `CREATING_BRANCH`):**
    -   **Current:** When transitioning from `INITIALIZING` to `CREATING_BRANCH`, the script returns the prompt: `Please create a new branch named feature/...`.
    -   **Proposed:** The script will read the `prTitle` from `ACTIVE_PR.json`, sanitize it into a branch name, and directly execute `git checkout main && git pull && git checkout -b [new-branch-name]`. It will then transition the state to `EXECUTING_TDD`.

-   **`get_task.sh` (Handling `MERGING_BRANCH`):**
    -   **Current:** When in the `MERGING_BRANCH` state, the script returns the prompt: `Please merge the branch.`
    -   **Proposed:** The script will directly execute the merge sequence: `git checkout main && git pull && git merge --no-ff [branch]`. If successful, it will run `git branch -d [branch]`, delete `ACTIVE_PR.json`, and reset the state to `INITIALIZING`. If the merge fails, it will transition the state to `HALTED` and provide a clear error message.

#### 4.2. Component 2: Test Suite Enhancement

A new test case will be added to the Vitest integration test suite to cover the missing scenario.

-   **`orchestration.integration.test.ts`:**
    -   **Proposed:** A new test, "should instruct to create a safety checkpoint after a green step," will be added.
    -   **Logic:** The test will set up the orchestrator state such that a `GREEN` step has just been completed (by setting `last_completed_step: "GREEN"` in `ORCHESTRATION_STATE.json`). It will then call `get_task` and assert that the returned output contains the expected instruction to create a checkpoint commit.

### 5. Test Plan

The verification for these changes will rely on enhancing the existing integration test suite.

1.  **`orchestration.integration.test.ts`:**
    -   The test case for the `CREATING_BRANCH` transition will be modified. Instead of asserting the script's output, it will mock the `child_process.exec` function and assert that the correct `git checkout -b` command was called by the tool.
    -   The test case for the `MERGING_BRANCH` transition will be similarly modified to assert that the correct `git merge` and `git branch -d` commands are called.
    -   The new test case for the "safety checkpoint" instruction will be added as described in section 4.2.

The successful execution of the updated and expanded test suite will serve as the complete verification for this alignment effort.
