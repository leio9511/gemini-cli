## **Hotfix Plan: Restoring Confirmation and UI for File Modification Tools**

**Status:** Proposal
**Author:** gemini-agent
**Date:** August 5, 2025

### 1. Abstract

This document outlines a hotfix for two critical regressions introduced after the implementation of the state-verified file modification toolchain. The `write_file` tool currently executes without user confirmation, posing a significant safety risk. Additionally, both `safe_patch` and `write_file` fail to keep the diff view visible in the UI after a change is confirmed, degrading the user experience. This plan details the cause of these issues and provides a precise, test-driven development (TDD) plan to restore the expected behavior.

### 2. Problem Statement

Following the rollout of the new `safe_patch` and state-aware `write_file` tools, two key issues have emerged:

1.  **Critical Safety Failure in `write_file`:** The `write_file` tool, when used to overwrite an existing file, applies the change silently without prompting the user for confirmation. This removes a critical safety check and could lead to unintentional data loss.

2.  **Degraded UI Experience:** Before the changes, when a user confirmed a file modification via the diff view, the diff would remain on screen, providing clear context of the change that was just applied. Now, upon confirmation, the diff view disappears and is replaced by a simple success message (e.g., "Patch Applied"). This removes valuable context and makes the UI feel less responsive.

### 3. Cause Analysis

My investigation has identified two distinct root causes for these problems:

1.  **Missing Confirmation Logic:** The `WriteFileTool` class in `packages/core/src/tools/write-file.ts` is missing the `shouldConfirmExecute` method. This method is responsible for intercepting the tool call, performing pre-execution checks (like hash verification), generating a diff, and presenting it to the user for approval. Its absence causes the tool to proceed directly to the `execute` method.

2.  **Incorrect Post-Execution Return Value:** The `execute` methods for both `SafePatchTool` and `WriteFileTool` currently return a simple string in the `returnDisplay` field of their `ToolResult` (e.g., `{ returnDisplay: 'Patch Applied' }`). The CLI's UI is designed to render a persistent diff view only when `returnDisplay` is a `ToolResultDisplay` object containing the `fileDiff`, `fileName`, and content. By returning only a string, the tools are inadvertently telling the UI that there is no diff to display.

### 4. Agile TDD Execution Plan

This plan will restore the correct behavior by re-implementing the missing logic and correcting the return values, following a strict Test-Driven Development (TDD) workflow.

---

#### **Phase 1: Restore `write_file` Confirmation (The Safety Fix)**

**Goal:** Ensure `write_file` never executes without user confirmation when overwriting a file.

1.  **Task: Write Failing Test for Confirmation (Red)**
    - **Where:** `packages/core/src/tools/write-file.test.ts`.
    - **How:** Create a new test case that calls the `shouldConfirmExecute` method on an instance of `WriteFileTool`.
    - **Assertion:** The test will initially fail to compile or run because the method does not exist. This is the "Red" state.
    - **Command:** `npm test -w @google/gemini-cli-core -- src/tools/write-file.test.ts`

2.  **Task: Implement `shouldConfirmExecute` (Green)**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:**
      - Implement the `async shouldConfirmExecute` method in the `WriteFileTool` class.
      - The method will replicate the logic from `safe_patch`: read the on-disk file, verify its SHA256 hash against the `base_content_sha256` parameter, and return `false` if there is a mismatch.
      - If the hash matches, it will generate a diff between the on-disk content and the new proposed content.
      - It will return a `ToolEditConfirmationDetails` object containing the `fileDiff` and other necessary details for the UI.
    - **Assertion:** The test from the previous step should now pass. This is the "Green" state.

3.  **Task: Refactor `shouldConfirmExecute` (Refactor)**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:** Review the newly added code for clarity, consistency, and opportunities to extract helper functions if needed. Ensure it matches the style of `safe-patch.ts`.

**Check Point 1: `write_file` Confirmation is Restored**

- **State:** Green.
- **Verification:** All tests for `WriteFileTool` are passing. The full preflight check (`npm run preflight`) passes. Manually running the CLI and attempting to overwrite a file with `write_file` now correctly shows the confirmation diff view.

---

#### **Phase 2: Fix Persistent Diff View (The UI Fix)**

**Goal:** Ensure the diff view remains on screen after confirming a change for both `safe_patch` and `write_file`.

1.  **Task: Update `safe_patch` Test for UI (Red)**
    - **Where:** `packages/core/src/tools/safe-patch.test.ts`.
    - **How:** Modify an existing test for a successful `execute` call.
    - **Assertion:** Change the assertion to check that the `returnDisplay` property of the `ToolResult` is an object that includes a `fileDiff` property, not just a string. This test will fail.
    - **Command:** `npm test -w @google/gemini-cli-core -- src/tools/safe-patch.test.ts`

2.  **Task: Update `safe_patch` Return Value (Green)**
    - **Where:** `packages/core/src/tools/safe-patch.ts`.
    - **How:** In the `execute` method, upon successful execution, instead of returning `{ returnDisplay: 'Patch Applied' }`, construct and return a `ToolResultDisplay` object containing the `fileDiff`, `fileName`, `originalContent`, and `newContent`.
    - **Assertion:** The test from the previous step should now pass.

3.  **Task: Update `write_file` Test for UI (Red)**
    - **Where:** `packages/core/src/tools/write-file.test.ts`.
    - **How:** Modify an existing test for a successful `execute` call.
    - **Assertion:** Change the assertion to check that the `returnDisplay` property is a `ToolResultDisplay` object with a `fileDiff`, not a string. This test will fail.
    - **Command:** `npm test -w @google/gemini-cli-core -- src/tools/write-file.test.ts`

4.  **Task: Update `write_file` Return Value (Green)**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:** In the `execute` method, upon successful file creation or overwrite, construct and return the same `ToolResultDisplay` object as `safe_patch`.
    - **Assertion:** The test from the previous step should now pass.

5.  **Task: Refactor Both Tools (Refactor)**
    - **Where:** `safe-patch.ts` and `write-file.ts`.
    - **How:** Review the changes in both `execute` methods for consistency and clarity.

**Milestone: Hotfix Complete**

- **State:** Green.
- **Verification:** All unit tests pass and `npm run preflight` is successful. End-to-end manual testing confirms:
  1.  `write_file` now requires user confirmation for overwrites.
  2.  The diff view for both `safe_patch` and `write_file` persists after the user confirms the change.
- **Action:** The hotfix is ready for review and merging.
