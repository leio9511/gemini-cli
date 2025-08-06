### **TDD Plan: Optimizing Tool Failure Responses to Reduce Token Usage**

**Status:** In Progress
**Author:** gemini-agent
**Date:** August 6, 2025
**Commit:**

---

### 1. Abstract

This document outlines a development plan to optimize the failure-mode responses of the `safe_patch` and `write_file` tools. Currently, when `safe_patch` fails due to an invalid diff, it returns the full, unchanged file content, which is redundant and consumes unnecessary tokens as the model already possesses this information. Conversely, `write_file` suffers from an inconsistency where it fails to return updated file content during a critical state mismatch error, hindering the model's ability to self-correct. This plan details a test-driven approach to refactor the error handling in both tools to make them more token-efficient and robust.

### 2. Problem Statement

When the LLM generates a syntactically incorrect patch, the `safe_patch` tool fails with an "Invalid Diff" error. The tool's current response includes the complete, unchanged content of the target file in a `latest_file_state` object. This is inefficient because the model already has this exact content in its context from the preceding `read_file` call that was used to generate the patch. This redundancy wastes tokens and can potentially complicate the model's error-correction logic.

Furthermore, the `write_file` tool exhibits an inconsistent and unhelpful behavior. In the critical scenario of a state mismatch (where the file on disk has changed since it was last read), it fails without returning the updated file content. This prevents the model from receiving the necessary information to resolve the conflict and proceed, creating a dead-end interaction.

### 3. Cause Analysis

The root causes of these issues lie in the specific error-handling implementations of each tool:

1.  **`safe_patch`:** The `execute` method's `catch` block for an `InvalidDiffError` unconditionally calls a private helper method (`_createFailureResult`) which is designed to attach the `latest_file_state` to all failure responses. This generic approach does not account for the specific case where the failure is in the diff itself, not the file state.

2.  **`write_file`:** The error handling logic in `write_file` is inconsistent. It correctly omits file content on generic filesystem errors (e.g., permission denied), which is desirable. However, it incorrectly omits the file content when it detects a hash mismatch, which is the one case where the model urgently needs the new content to update its own state.

### 4. Agile TDD Execution Plan

This plan will refactor the error-handling logic in both tools following a Test-Driven Development (TDD) workflow to enhance efficiency and robustness.

---

#### **Phase 1: Optimize `safe_patch` Failure Response**

**Goal:** Modify `safe_patch` to stop returning redundant file content when a diff is invalid.

1.  **Task: Write Failing Test for `safe_patch` Invalid Diff (Red)**
    - **Where:** `packages/core/src/tools/safe-patch.test.ts`.
    - **How:**
      1.  Create a new test case for the `execute` method.
      2.  Mock the `applyFuzzyPatch` utility to throw an `InvalidDiffError`.
      3.  Call `tool.execute()` with valid parameters.
      4.  Assert that the `result.llmContent` object **does not** have a `latest_file_state` property.
    - **Assertion:** The test will fail because the current implementation always adds `latest_file_state` on failure.

2.  **Task: Update `safe_patch` to Omit Redundant Content (Green)**
    - **Where:** `packages/core/src/tools/safe-patch.ts`.
    - **How:**
      1.  In the `execute` method, locate the `catch` block for `InvalidDiffError`.
      2.  Modify the return statement within this block to output a simple object: `{ llmContent: { success: false, message: e.message } }`.
      3.  Remove the call to `this._createFailureResult`.
    - **Assertion:** The test from the previous step will now pass.

---

#### **Phase 2: Correct `write_file` State Mismatch Handling**

**Goal:** Modify `write_file` to provide the updated file content during a state mismatch error.

1.  **Task: Write Failing Test for `write_file` State Mismatch (Red)**
    - **Where:** `packages/core/src/tools/write-file.test.ts`.
    - **How:**
      1.  Create a test case that simulates a state mismatch. Provide a `base_content_sha256` that differs from the hash of the mock file content on the "disk".
      2.  Call `tool.execute()`.
      3.  Assert that the `result.llmContent` object **does** have a `latest_file_state` property containing the updated file information.
    - **Assertion:** The test will fail because the current implementation returns a simple error message without the file state.

2.  **Task: Update `write_file` to Return Content on Mismatch (Green)**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:**
      1.  In the `execute` method, find the `if (actualHash !== base_content_sha256)` block.
      2.  Inside this block, call `createVersionedFileObject` to construct a `latestFileState` object from the content on disk.
      3.  Modify the return statement to include this `latestFileState` object within `llmContent`.
    - **Assertion:** The test from the previous step will now pass. The generic `catch (e)` block for other filesystem errors should remain unchanged, as its behavior is already correct.

---

#### **Phase 3: Final Verification**

**Goal:** Clean up the codebase and run full system checks to ensure correctness.

1.  **Task: Code Review and Refinement**
    - **How:** Manually review the changes in `safe-patch.ts` and `write-file.ts` to ensure the logic is clear, consistent, and well-documented.

2.  **Task: Final Verification**
    - **How:** Run the full preflight check to ensure all changes are valid, all existing and new tests pass, and no regressions or type errors were introduced.
    - **Command:** `npm run preflight`

---

### **Milestone: Tool Failures Optimized**

- **State:** Green.
- **Verification:** All unit tests pass. `npm run preflight` is successful. `safe_patch` is now more token-efficient on failure, and `write_file` provides more robust feedback to the model, preventing dead-end interactions.
