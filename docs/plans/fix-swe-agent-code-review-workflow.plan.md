# Feature Plan: Fix SWE Agent Code Review Workflow

**Reference Design Doc:** @docs/designs/swe-agent-code-review-fix.md

This plan outlines the engineering steps required to fix the broken code review trigger in the SWE Agent's orchestration logic. The goal is to align the implementation with the design by making the code review process a fully automated, orchestrator-driven action within the `get_task.sh` tool.


## Phase 1: Refactor Orchestration Logic and Tooling

### Pull Request #1: fix(swe-agent): Automate code review trigger and remove agent tool [DONE] d4cfbfa4d0c8fea5c77668ee71b256ee3f7451fa

-   **PR Title:** fix(swe-agent): Automate code review trigger and remove agent tool
-   **Summary:** This PR refactors the SWE agent's orchestration logic to automatically trigger and handle the code review process within `get_task.sh` when all tasks are complete. It removes the broken and misleading `request_code_review` tool from the agent's available toolkit and cleans up the now-redundant handling logic from `submit_work.sh`. This change fixes a critical bug that prevented the agent from completing a PR autonomously and aligns the implementation with the original design.
-   **Verification Plan:**
    -   The existing Vitest integration test suite (`.agents/swe_agent/tests/`) will be run to validate the changes.
    -   The test case `should_transition_from_code_review_to_executing_tdd.integration.test.ts` will be updated. It will be modified to test the `get_task` tool's behavior when a review returns findings, ensuring it correctly adds new tasks to `ACTIVE_PR.json` and sets the state to `EXECUTING_TDD`.
    -   The test case for an approved code review in `orchestration.integration.test.ts` will be updated to reflect the new automated flow, asserting that `get_task` transitions the state to `AWAITING_FINALIZATION`.
    -   A full `npm run preflight -w @google/gemini-cli-swe-agent-tests` will be executed to ensure all tests pass and the agent's orchestration logic is sound.
-   **Planned Implementation Tasks:**
    -   [ ] Task: Read the content of `.agents/swe_agent/tools/get_task.sh`.
    -   [ ] Task: Modify `get_task.sh` to remove the deletion of `ACTIVE_PR.json` when all tasks are done.
    -   [ ] Task: In `get_task.sh`, add logic to directly execute `request_code_review.sh` and capture its output when all tasks are complete.
    -   [ ] Task: In `get_task.sh`, add conditional logic to process the review findings:
        -   If findings exist, add them as new tasks to `ACTIVE_PR.json` and set the state to `EXECUTING_TDD`.
        -   If no findings exist, set the state to `AWAITING_FINALIZATION` and instruct the agent to squash commits.
    -   [ ] Task: Read the content of `.agents/swe_agent/tools/submit_work.sh`.
    -   [ ] Task: Modify `submit_work.sh` to remove the `handle_code_review_state` function and its corresponding case in the main `case` block.
    -   [ ] Task: Read the content of `.agents/swe_agent/tools/discover.sh`.
    -   [ ] Task: Modify `discover.sh` to remove the JSON definition for the `request_code_review` tool.
    -   [ ] Task: Review and update the relevant integration tests to align with the new, automated code review flow.
    -   [ ] Task: Run the full test suite to verify the fix.
