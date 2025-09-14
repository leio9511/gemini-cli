# Design Doc: SWE Agent Code Review Workflow Fix

**Status:** PROPOSED

## 1. Context & Problem Statement

During a review of the SWE Agent's implementation against its design (`swe-agent-workflow.md`), a critical bug and a design inconsistency were discovered in the code review and finalization phase. The current implementation prevents the agent from successfully completing a pull request autonomously.

### Problem 1: Broken Code Review Trigger

The workflow is designed for the orchestrator to automatically trigger a code review once all TDD tasks are complete. The current implementation attempts this but fails due to a logical error.

1.  **Detection:** The `get_task.sh` script correctly identifies when all tasks in `ACTIVE_PR.json` are `DONE`.
2.  **State Transition:** It correctly transitions the orchestrator's state to `CODE_REVIEW`.
3.  **The Bug:** Immediately after setting the state, `get_task.sh` **deletes the `ACTIVE_PR.json` file** and then returns a prompt to the agent: "All tasks are complete. Requesting code review."
4.  **The Failure:** The agent, upon receiving this prompt, is expected to call the `request_code_review` tool. However, that tool requires `ACTIVE_PR.json` to get the PR's title, summary, and other context for the review agent. Since the file was just deleted, the tool call fails, and the workflow halts.

### Problem 2: Orphaned and Misleading Tool

The `discover.sh` script exposes a `request_code_review` tool to the agent. The agent is prompted to use this tool. This contradicts the core design philosophy.

-   **Design Inconsistency:** The `swe-agent-workflow.md` design document explicitly states that the **Orchestrator** is responsible for invoking the code review script. The agent's role is to complete TDD steps, not to decide when a code review is needed.
-   **Agent Confusion:** Exposing this tool gives the agent a capability it should not have and prompts it to perform an action that is destined to fail due to the bug described above. This creates a misleading and broken workflow.

## 2. Proposed Solution

To fix the bug and align the implementation with the original design, the following changes will be made. The core principle is to make the code review process a fully automated, orchestrator-driven action, removing the agent from the decision-making loop.

### 2.1. Centralize Code Review Logic in `get_task.sh`

The `get_task.sh` script will be modified to become the single point of control for the code review process.

When `get_task` is called and detects that all tasks are complete, it will perform the following steps **instead of** deleting the `ACTIVE_PR.json` file:

1.  **Invoke Review:** It will directly execute the `.agents/swe_agent/tools/request_code_review.sh` script and capture the JSON output (the findings).
2.  **Process Findings:**
    -   **If findings exist:** It will parse the findings and append them as new tasks to `ACTIVE_PR.json`. It will then set the state back to `EXECUTING_TDD` and return a message to the agent informing it of the new tasks.
    -   **If there are no findings (review approved):** It will set the state to `AWAITING_FINALIZATION` and return the instruction for the agent to squash its commits.
3.  The `ACTIVE_PR.json` file will be preserved throughout this process.

### 2.2. Remove Redundant Logic from `submit_work.sh`

The `handle_code_review_state` function in `submit_work.sh` was a workaround for the broken trigger. Since the logic is being moved to `get_task.sh`, this function will be removed to avoid code duplication and confusion.

### 2.3. Remove `request_code_review` from the Agent's Toolkit

The `discover.sh` script will be updated to remove the `request_code_review` tool definition. This aligns the agent's available tools with the design, ensuring it cannot attempt to trigger a code review manually.

## 3. Benefits of this Change

-   **Reliability:** The code review process will become a deterministic, automated step managed by the orchestrator, fixing the workflow-halting bug.
-   **Design Alignment:** The implementation will correctly reflect the design's intent, where the orchestrator manages state and triggers processes, and the agent executes tasks.
-   **Simplicity:** The agent's responsibilities are simplified. It no longer needs to know when or how to request a review; it simply completes tasks until it is told the PR is approved.
-   **Maintainability:** Centralizing the review logic in `get_task.sh` makes the workflow easier to understand and maintain.
