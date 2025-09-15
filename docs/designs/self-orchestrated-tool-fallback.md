# Design Doc: Self-Orchestrated Fallback for `safe_patch`

**Author:** Gemini Agent
**Status:** Proposed
**Created:** 2025-09-15
**Last Updated:** 2025-09-15

## 1. Overview

This document proposes a significant enhancement to the `safe_patch` tool to make it more resilient to repeated failures. Currently, the LLM agent can get stuck in a loop if it repeatedly fails to generate a valid `unified_diff` for a file. This leads to a poor user experience and inefficient token usage.

This proposal details a plan to make the `safe_patch` tool "self-orchestrated" by embedding stateful, session-aware logic directly into its implementation. The tool will track its own failures and, after a certain threshold of repeated failures on the same file, will provide an augmented response that explicitly instructs the agent to switch its strategy to using the more robust `write_file` tool.

## 2. Problem Statement

The `safe_patch` tool is the preferred method for file modification due to its precision. However, LLMs can sometimes struggle to generate a perfectly correct `unified_diff`, leading to an `InvalidDiffError`. While the tool correctly informs the agent of this failure, the agent's recovery strategy is often to simply try again, sometimes leading to a persistent failure loop.

This creates a frustrating user experience and wastes time and resources. The system currently lacks a mechanism to detect this repetitive failure pattern and guide the agent toward a more reliable alternative.

## 3. Proposed Solution

The solution is to introduce stateful, session-aware logic directly into the `safe_patch` tool itself. This logic will track the number of consecutive `InvalidDiffError` failures for a specific file within a single user session.

### 3.1. State Management

- A failure counter will be managed within the `SessionStateService`, which is already available to the tool.
- The counter will be specific to each file path and will track the number of *consecutive* `InvalidDiffError` failures.
- The counter for a file will be reset to `0` upon:
    1. A successful `safe_patch` operation on that file.
    2. A failure of a different type (e.g., `HASH_MISMATCH`).
    3. The failure threshold being met and the augmented message being delivered.

### 3.2. Modified Tool Logic

The `execute` method of the `SafePatchTool` will be modified to incorporate the following logic within its `catch (e)` block for `InvalidDiffError`:

1. **Increment Counter:** When an `InvalidDiffError` is caught, increment the failure counter for the given `file_path` in the `SessionStateService`.
2. **Check Threshold:** Compare the failure count against a predefined threshold (e.g., `2`).
3. **Return Standard Error:** If the threshold has not been met, return the existing, concise error message for an invalid patch.
4. **Return Augmented Error:** If the threshold is met or exceeded:
    a. Reset the failure counter for that file to `0`.
    b. Return a new, augmented error response with a distinct `error_type` and a message that explicitly instructs the agent to use `write_file` in its next turn for that file.

### 3.3. New Error Response

When the failure threshold is met, the tool will return the following structured response:

```json
{
  "success": false,
  "error_type": "INVALID_PATCH_LIMIT_EXCEEDED",
  "message": "You have failed to generate a valid patch for this file multiple times. Do not try safe_patch again for this file in your next turn. Instead, use the write_file tool. Read the file to get the latest content, apply your intended changes to the full content, and then use write_file to overwrite it."
}
```

## 4. Rationale

- **Encapsulation:** This approach encapsulates the complex recovery logic within the tool itself, keeping the agent's core prompt simple and focused.
- **Reliability:** It uses the deterministic `SessionStateService` for state tracking, which is more reliable than asking the LLM to remember its own failures.
- **Just-in-Time Instruction:** The guidance to switch strategy is provided at the exact moment it is needed, making it highly likely the agent will follow the instruction.
- **Improved User Experience:** This will break frustrating failure loops, leading to faster and more successful task completion.

## 5. Implementation Plan

The implementation will be focused entirely within `packages/core/src/tools/safe-patch.ts`.

1.  **Task: Update `SessionStateService` (if needed)**
    -   Define a structure within the session state to hold the failure counts (e.g., `safePatchFailures: Map<string, number>`).

2.  **Task: Modify `SafePatchTool.execute()`**
    -   In the `catch` block for `InvalidDiffError`, implement the logic to access the session state, increment the counter, and check the threshold.
    -   Implement the conditional return logic to send either the standard error or the new augmented error.
    -   Ensure the counter is correctly reset on success or other failure types.

3.  **Task: Add Unit Tests**
    -   Create a new test file or add to an existing one to verify the new logic.
    -   Test Case 1: Ensure the standard `INVALID_PATCH` error is returned on the first failure.
    -   Test Case 2: Ensure the new `INVALID_PATCH_LIMIT_EXCEEDED` error is returned after the threshold is met (e.g., on the second consecutive failure).
    -   Test Case 3: Ensure the counter is reset after a successful patch operation.
    -   Test Case 4: Ensure the counter is reset after a `HASH_MISMATCH` error.
