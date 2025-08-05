### **TDD Plan: Implementing Session-Only "Always Allow" for File Modification Tools**

**Status:** Proposal
**Author:** gemini-agent
**Date:** August 5, 2025

---

### 1. Abstract

This document outlines a development plan to align the confirmation behavior of `safe_patch` and `write_file` with the existing, session-only "always allow" functionality of the `shell` tool. The current implementation of the file modification tools does not respect a user's in-session choice to bypass confirmations, leading to an inconsistent user experience. This plan details a test-driven approach to implement a session-specific allowlist for both tools, ensuring that a user's preference to "always allow" is respected for the duration of the current CLI session.

This plan explicitly reverts the changes made under the incorrect assumption that "always allow" was a persistent, global setting, as detailed in a previous design document.

### 2. Problem Statement

The "always allow" feature, which is intended to streamline tool use by bypassing repeated confirmations within a single session, is not functional for `safe_patch` and `write_file`. While the `shell` tool correctly remembers this preference for the session's lifetime, the file modification tools prompt for confirmation on every use. This inconsistency creates unnecessary friction for the user. The desired behavior is for all tools that support confirmation to handle the "always allow" setting as a session-only preference.

### 3. Cause Analysis

The `ShellTool` class uses a private, instance-level `allowlist` to track commands that have been approved for the session. When a user selects "always allow," the command is added to this list, and subsequent calls bypass confirmation.

Conversely, the `SafePatchTool` and `WriteFileTool` classes lack this internal, session-specific state management. Their `shouldConfirmExecute` methods were designed to check a global, persistent configuration based on a flawed understanding of the feature's intent. The `onConfirm` callback in these tools is currently empty and does not capture the user's "always allow" choice.

The previous fix (commit `9234db61`) incorrectly introduced logic to check a global `toolConfirmation` setting in the main `Config` object. This will be reverted.

### 4. Agile TDD Execution Plan

This plan will introduce a session-specific "always allow" mechanism to the file modification tools, following a strict Test-Driven Development (TDD) workflow. This involves reverting the incorrect global setting logic and replacing it with a session-based approach.

---

#### **Phase 1: Implement Session-Only "Always Allow" for `write_file`**

**Goal:** Ensure `write_file` respects the user's choice to bypass confirmation for the current session.

1.  **Task: Write Failing Test for Session-Specific Confirmation (Red)**
    *   **Where:** `packages/core/src/tools/write-file.test.ts`.
    *   **How:** Create a new test case for `shouldConfirmExecute`.
        1.  Instantiate `WriteFileTool`.
        2.  Call `shouldConfirmExecute` once and capture the returned confirmation details object.
        3.  Invoke its `onConfirm` callback, passing `ToolConfirmationOutcome.ProceedAlways` as the argument.
        4.  Call `shouldConfirmExecute` a *second time* with the same parameters.
    *   **Assertion:** Assert that the *second* call to `shouldConfirmExecute` returns `false`. The test will fail because the tool currently has no internal state to remember the choice.
    *   **Command:** `npm test -w @google/gemini-cli-core -- src/tools/write-file.test.ts`

2.  **Task: Implement Session-Specific State (Green)**
    *   **Where:** `packages/core/src/tools/write-file.ts`.
    *   **How:**
        1.  **Revert:** Remove the incorrect check for `this.config.getToolConfirmationSetting(...)`.
        2.  **Implement:** Add a private instance variable: `private alwaysAllowed = false;`.
        3.  **Implement:** In `shouldConfirmExecute`, add a check at the beginning for the new `alwaysAllowed` flag.
        4.  **Implement:** In the `onConfirm` callback returned by `shouldConfirmExecute`, add logic to set `this.alwaysAllowed = true;` when the `outcome` is `ToolConfirmationOutcome.ProceedAlways`.
        5.  **Import:** Add `ToolConfirmationOutcome` to the import from `./tools.js`.
    *   **Assertion:** The test from the previous step should now pass.

3.  **Task: Refactor `shouldConfirmExecute` (Refactor)**
    *   **Where:** `packages/core/src/tools/write-file.ts` and `packages/core/src/tools/write-file.test.ts`.
    *   **How:** Review the changes for clarity and simplicity. Remove the now-unused test that mocks `getToolConfirmationSetting`.

---

#### **Phase 2: Implement Session-Only "Always Allow" for `safe_patch`**

**Goal:** Ensure `safe_patch` respects the user's choice to bypass confirmation for the current session.

1.  **Task: Write Failing Test for Session-Specific Confirmation (Red)**
    *   **Where:** `packages/core/src/tools/safe-patch.test.ts`.
    *   **How:** Create a new test case for `shouldConfirmExecute`, following the exact same pattern as the one for `write_file`.
    *   **Assertion:** Assert that the second call to `shouldConfirmExecute` returns `false`. This test will fail.
    *   **Command:** `npm test -w @google/gemini-cli-core -- src/tools/safe-patch.test.ts`

2.  **Task: Implement Session-Specific State (Green)**
    *   **Where:** `packages/core/src/tools/safe-patch.ts`.
    *   **How:**
        1.  **Revert:** Remove the incorrect check for `this.config.getToolConfirmationSetting(...)`.
        2.  **Implement:** Add a private instance variable: `private alwaysAllowed = false;`.
        3.  **Implement:** Update `shouldConfirmExecute` to check this flag.
        4.  **Implement:** Implement the `onConfirm` callback to set the flag when appropriate.
        5.  **Import:** Add `ToolConfirmationOutcome`.
    *   **Assertion:** The test from the previous step should now pass.

3.  **Task: Refactor Both Tools (Refactor)**
    *   **Where:** `safe-patch.ts`, `write-file.ts`, and their corresponding test files.
    *   **How:** Review the changes in both tools for consistency and clarity. Remove the now-unused tests that mock `getToolConfirmationSetting`.

---

#### **Phase 3: Revert Unnecessary Global Configuration**

**Goal:** Remove the now-unused `toolConfirmation` logic from the global `Config` object.

1.  **Task: Remove `toolConfirmation` from `Config`**
    *   **Where:** `packages/core/src/config/config.ts`.
    *   **How:**
        1.  Remove the `toolConfirmation` property from the `ConfigParameters` interface and the `Config` class.
        2.  Remove the `getToolConfirmationSetting` method.
        3.  Remove the initialization of `this.toolConfirmation` in the `Config` constructor.
    *   **Verification:** Run the full test suite to ensure no other part of the codebase was relying on this.

---

**Milestone: Hotfix Complete**

*   **State:** Green.
*   **Verification:** All unit tests for `WriteFileTool` and `SafePatchTool` pass. `npm run preflight` is successful. Manual testing confirms that "always allow" now works correctly as a session-only setting for both tools, consistent with the `shell` tool.
