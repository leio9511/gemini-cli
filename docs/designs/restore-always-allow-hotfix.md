## **Hotfix Plan: Restoring "Always Allow" Confirmation Setting for File Modification Tools**

**Status:** Proposal
**Author:** gemini-agent
**Date:** August 5, 2025

### 1. Abstract

This document outlines a hotfix to address a regression where the `safe_patch` and `write_file` tools ignore a user's "always allow" preference for tool execution. Currently, these tools prompt for confirmation on every use, regardless of the user's saved settings. This plan details the cause of this issue and provides a precise, test-driven development (TDD) plan to restore the expected behavior, ensuring that user preferences for bypassing confirmation are respected.

### 2. Problem Statement

The `safe_patch` and `write_file` tools are designed to be confirmed by the user before execution as a safety measure. However, the CLI provides a feature for users to mark a tool as "always allow," which should bypass this confirmation step for subsequent uses. This feature is currently not being respected by these two tools. Users who have explicitly chosen to always allow these tools are still being forced to confirm each action, leading to unnecessary friction and a degraded user experience.

### 3. Cause Analysis

My investigation reveals that the root cause lies within the `shouldConfirmExecute` methods of both the `SafePatchTool` and `WriteFileTool` classes. These methods were implemented as part of a previous hotfix (`state-verified-file-modification-hotfix.md`) to solve a critical safety issue where file modifications could happen without any user confirmation.

In the process of implementing this crucial safety check, the logic to consult the user's configuration for the "always allow" setting was omitted. The current implementation of `shouldConfirmExecute` in both tools proceeds directly to generating a diff and returning a `ToolCallConfirmationDetails` object, thereby unconditionally triggering a confirmation prompt. It never checks the setting stored in the user's configuration.

### 4. Agile TDD Execution Plan

This plan will restore the correct behavior by re-introducing the check for the user's "always allow" preference, following a strict Test-Driven Development (TDD) workflow.

---

#### **Phase 1: Restore "Always Allow" for `write_file`**

**Goal:** Ensure `write_file` respects the user's choice to bypass confirmation.

1.  **Task: Write Failing Test for Confirmation Bypass (Red)**
    - **Where:** `packages/core/src/tools/write-file.test.ts`.
    - **How:** Create a new test case for `shouldConfirmExecute`. In this test, mock the `Config` service to return `'always'` when `getToolConfirmationSetting('write_file')` is called.
    - **Assertion:** Assert that `shouldConfirmExecute` returns `false`. The test will fail because the current implementation always returns a confirmation object.
    - **Command:** `npm test -w @google/gemini-cli-core -- src/tools/write-file.test.ts`

2.  **Task: Implement Confirmation Check (Green)**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:**
      - At the beginning of the `shouldConfirmExecute` method, add a condition to check the user's preference.
      - `if (this.config.getToolConfirmationSetting(WriteFileTool.Name) === 'always') { return false; }`
    - **Assertion:** The test from the previous step should now pass.

3.  **Task: Refactor `shouldConfirmExecute` (Refactor)**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:** Review the change for clarity and ensure it integrates cleanly with the existing logic.

**Check Point 1: `write_file` "Always Allow" is Restored**

- **State:** Green.
- **Verification:** All tests for `WriteFileTool` are passing.

---

#### **Phase 2: Restore "Always Allow" for `safe_patch`**

**Goal:** Ensure `safe_patch` respects the user's choice to bypass confirmation.

1.  **Task: Write Failing Test for Confirmation Bypass (Red)**
    - **Where:** `packages/core/src/tools/safe-patch.test.ts`.
    - **How:** Create a new test case for `shouldConfirmExecute`, similar to the one for `write_file`. Mock the `Config` service to return `'always'` for `getToolConfirmationSetting('safe_patch')`.
    - **Assertion:** Assert that `shouldConfirmExecute` returns `false`. This test will fail.
    - **Command:** `npm test -w @google/gemini-cli-core -- src/tools/safe-patch.test.ts`

2.  **Task: Implement Confirmation Check (Green)**
    - **Where:** `packages/core/src/tools/safe-patch.ts`.
    - **How:**
      - At the beginning of the `shouldConfirmExecute` method, add the same condition.
      - `if (this.config.getToolConfirmationSetting(SafePatchTool.Name) === 'always') { return false; }`
    - **Assertion:** The test from the previous step should now pass.

3.  **Task: Refactor Both Tools (Refactor)**
    - **Where:** `safe-patch.ts` and `write-file.ts`.
    - **How:** Review the changes in both `shouldConfirmExecute` methods for consistency and clarity.

**Milestone: Hotfix Complete**

- **State:** Green.
- **Verification:** All unit tests pass and `npm run preflight` is successful. End-to-end manual testing confirms that setting "always allow" for `write_file` and `safe_patch` correctly bypasses the confirmation prompt.
- **Action:** The hotfix is ready for review and merging.
