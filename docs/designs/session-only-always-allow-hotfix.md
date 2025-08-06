### **TDD Plan: Implementing Shared Session-Only "Always Allow" for File Modification Tools**

**Status:** DONE
**Author:** gemini-agent
**Date:** August 5, 2025
**Commit:** ba94a6a09ca05d3c8911c3facbfa797c5798619f

---

### 1. Abstract

This document outlines a development plan to implement a shared, session-only "always allow" functionality for the `safe_patch` and `write_file` tools. The current implementation does not respect a user's in-session choice to bypass confirmations consistently, and the initial fix incorrectly isolated this preference to each tool. This plan details a test-driven approach to implement a shared, session-specific allowlist, ensuring that a user's preference to "always allow" for one file modification tool is respected by the other for the duration of the current CLI session.

This plan explicitly reverts the changes made under the incorrect assumption that "always allow" was a persistent, global setting, and also corrects the flawed assumption that the setting should be handled independently by each tool.

### 2. Problem Statement

The "always allow" feature is intended to streamline tool use by bypassing repeated confirmations within a single session. However, it is not functional for `safe_patch` and `write_file`. Furthermore, the desired user experience is that related tools, such as those that modify files, should share this preference. If a user "always allows" a `write_file` operation, they should not be prompted again for a `safe_patch` operation in the same session. The current implementation prompts for every use, creating unnecessary friction.

### 3. Cause Analysis

The `ShellTool` class uses a private, instance-level `allowlist` to track commands that have been approved for the session. This model is insufficient for file modification tools, which are expected to share the preference.

The `SafePatchTool` and `WriteFileTool` classes currently lack any mechanism for shared state management. Their `shouldConfirmExecute` methods were designed to check a global, persistent configuration based on a flawed understanding of the feature's intent. The previous fix (commit `9234db61`) incorrectly introduced logic to check a global `toolConfirmation` setting in the main `Config` object, which will be reverted.

The correct approach is to manage this shared, session-only state within the central `Config` object, accessible by all tools.

### 4. Agile TDD Execution Plan

This plan will introduce a shared, session-specific "always allow" mechanism for file modification tools, following a strict Test-Driven Development (TDD) workflow.

---

#### **Phase 1: Implement Shared Session-Only State in `Config`**

**Goal:** Create a centralized, session-specific mechanism in the `Config` class to manage the "always allow" state for groups of tools.

1.  **Task: Write Failing Test for Shared State (Red)**
    - **Where:** A new test file, `packages/core/src/config/config-allowlist.test.ts`.
    - **How:**
      1.  Instantiate `Config`.
      2.  Assert that `isToolGroupAlwaysAllowed('file_modification')` initially returns `false`.
      3.  Call a new method, `setToolGroupAlwaysAllowed('file_modification')`.
      4.  Assert that `isToolGroupAlwaysAllowed('file_modification')` now returns `true`.
    - **Assertion:** The test will fail because the methods and underlying state do not exist.

2.  **Task: Implement Shared State in `Config` (Green)**
    - **Where:** `packages/core/src/config/config.ts`.
    - **How:**
      1.  Add a private instance variable: `private alwaysAllowedToolGroups = new Set<string>();`.
      2.  Implement the public method `setToolGroupAlwaysAllowed(group: string): void` which adds the given group to the `Set`.
      3.  Implement the public method `isToolGroupAlwaysAllowed(group:string): boolean` which checks if the group exists in the `Set`.
    - **Assertion:** The test from the previous step should now pass.

---

#### **Phase 2: Update File Tools to Use Shared State**

**Goal:** Ensure `write_file` and `safe_patch` use the new shared state mechanism from `Config`.

1.  **Task: Write Failing Test for Shared Confirmation (Red)**
    - **Where:** `packages/core/src/tools/file-tools-shared-allow.test.ts`.
    - **How:** Create a new test that verifies the shared behavior.
      1.  Instantiate `Config`, `WriteFileTool`, and `SafePatchTool`.
      2.  Call `shouldConfirmExecute` on the `WriteFileTool` instance.
      3.  Invoke its `onConfirm` callback, passing `ToolConfirmationOutcome.ProceedAlways`.
      4.  Call `shouldConfirmExecute` on the **`SafePatchTool`** instance.
    - **Assertion:** Assert that the call to `safe_patch`'s `shouldConfirmExecute` returns `false`. The test will fail because the tools are not yet using the shared state.
    - **Command:** `npm test -w @google/gemini-cli-core -- src/tools/file-tools-shared-allow.test.ts`

2.  **Task: Update `write_file` to Use Shared State (Green)**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:**
      1.  In `shouldConfirmExecute`, replace the check for the private `alwaysAllowed` flag with a call to `this.config.isToolGroupAlwaysAllowed('file_modification')`.
      2.  In the `onConfirm` callback, replace the logic that sets the private flag with a call to `this.config.setToolGroupAlwaysAllowed('file_modification')`.
      3.  Remove the now-unused `private alwaysAllowed = false;` instance variable.

3.  **Task: Update `safe_patch` to Use Shared State (Green)**
    - **Where:** `packages/core/src/tools/safe-patch.ts`.
    - **How:** Apply the exact same changes as for `write_file`.
    - **Assertion:** The test from step 1 of this phase should now pass.

---

#### **Phase 3: Refactor and Final Verification**

**Goal:** Clean up the codebase and run a full preflight check.

1.  **Task: Refactor and Remove Obsolete Tests**
    - **Where:** `safe-patch.test.ts` and `write-file.test.ts`.
    - **How:** Remove the individual "always allow" tests from each file, as their behavior is now covered by the new shared test. Ensure no other tests are checking the old, incorrect global configuration.

2.  **Task: Final Verification**
    - **How:** Run the full preflight check to ensure all changes are valid and no regressions were introduced.
    - **Command:** `npm run preflight`

---

**Milestone: Hotfix Complete**

- **State:** Green.
- **Verification:** All unit tests pass, including the new shared confirmation test. `npm run preflight` is successful. Manual testing confirms that "always allow" for one file tool correctly applies to the other for the duration of the session.
