# Feature Plan: Agent Tool Interaction Improvements

This document outlines the execution plan for the improvements detailed in the corresponding [design document](./../designs/agent-tool-interaction-improvements.md). The goal is to make the agent's interaction with file system tools more efficient and reliable.

---

## Phase 1: Enhance `safe_patch` Failure Response

**Objective:** Improve the feedback loop for the agent when a patch application fails, making it more token-efficient and providing more actionable error messages.

### Pull Request #1: feat(patchUtils): Add hunk numbers to InvalidDiffError

- **PR Title:** feat(patchUtils): Add hunk numbers to InvalidDiffError
- **Summary:** This PR modifies the `applyFuzzyPatch` utility to track which hunk it is processing and include the hunk number in any `InvalidDiffError` it throws. This provides more precise, actionable feedback to the agent when a patch fails.
- **Verification Plan:**
  - A new unit test file, `packages/core/src/utils/patchUtils.test.ts`, will be created.
  - A test case will be added to verify that when an invalid diff is provided, the `InvalidDiffError` is thrown and its message contains the correct hunk number (e.g., "Hunk #1...").
- **Planned Implementation Tasks:**
  - [ ] Task: Create the new test file `packages/core/src/utils/patchUtils.test.ts` with a failing test case.
  - [ ] Task: Modify the `applyFuzzyPatch` function in `packages/core/src/utils/patchUtils.ts` to use an indexed loop.
  - [ ] Task: Update the `InvalidDiffError` messages within `applyFuzzyPatch` to include the hunk number.
  - [ ] Task: Run the tests to ensure the new test passes and there are no regressions.

### Pull Request #2: fix(safe_patch): Omit redundant file content on patch failure

- **PR Title:** fix(safe_patch): Omit redundant file content on patch failure
- **Summary:** This PR updates the `safe_patch` tool to prevent it from returning the full, unchanged file content (`latest_file_state`) when it fails due to a patch application error (`InvalidDiffError`). This makes the tool's failure response more token-efficient.
- **Verification Plan:**
  - A new unit test will be added to `packages/core/src/tools/safe-patch.test.ts`.
  - The test will mock `applyFuzzyPatch` to throw an `InvalidDiffError`.
  - It will then call `safe_patch.execute()` and assert that the `llmContent` in the result **does not** contain a `latest_file_state` property.
- **Planned Implementation Tasks:**
  - [ ] Task: Create the new test file `packages/core/src/tools/safe-patch.test.ts` if it does not already exist.
  - [ ] Task: Write a failing test within this file that asserts the absence of `latest_file_state` on `InvalidDiffError`.
  - [ ] Task: Modify the `catch` block for `InvalidDiffError` in `packages/core/src/tools/safe-patch.ts` to return a simple error object without calling `_createFailureResult`.
  - [ ] Task: Run the tests to ensure the new test passes.

---

## Phase 2: Improve Agent Workflow via Prompt Engineering

**Objective:** Guide the LLM to adopt more efficient and reliable workflows through targeted modifications of the tool descriptions.

### Pull Request #3: docs(tools): Update tool descriptions for workflow improvements

- **PR Title:** docs(tools): Update tool descriptions for workflow improvements
- **Summary:** This PR updates the descriptions for the `safe_patch` and `write_file` tools. The changes introduce two new core instructions for the agent: 1) Prioritize using file content from the conversation history instead of always re-reading files, and 2) A mandatory requirement to verify the result of any successful file modification.
- **Verification Plan:**
  - As this is a prompt engineering change, verification will be manual.
  - The following test scenarios will be executed:
    - **Scenario 1 (Context-First):** Start a new chat. Ask the agent to read `file.txt`. Then, ask it to modify `file.txt`. The agent should use `safe_patch` directly without calling `read_file` again.
    - **Scenario 2 (Verification Mandate):** Ask the agent to create a new file using `write_file`. Its immediate next response should be a message confirming it has reviewed the created file's content.
    - **Scenario 3 (Combined):** After Scenario 1, ask the agent to make a second modification to `file.txt`. The agent should use the `latest_file_state` from the previous response and then provide another verification message.
- **Planned Implementation Tasks:**
  - [ ] Task: Update the description in `packages/core/src/tools/safe-patch.ts` to include the "use context first" instruction.
  - [ ] Task: Add the "Verification Mandate" to the `safe_patch` tool description.
  - [ ] Task: Update the description in `packages/core/src/tools/write-file.ts` to include the "use context first" instruction.
  - [ ] Task: Add the "Verification Mandate" to the `write_file` tool description.
  - [ ] Task: Manually run through test cases to confirm the agent's behavior has changed as expected.
