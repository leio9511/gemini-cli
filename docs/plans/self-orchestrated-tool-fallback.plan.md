# Feature Plan: Self-Orchestrated Fallback for `safe_patch`

**Reference Design Doc:** @[docs/designs/self-orchestrated-tool-fallback.md]

## Phase 1: Implement Stateful Failure Logic in `safe_patch`

### Pull Request #1: feat(safe-patch): Introduce self-orchestrated fallback to write_file

- **PR Title:** feat(safe-patch): Introduce self-orchestrated fallback to write_file
- **Summary:** This PR enhances the `safe_patch` tool to be more resilient. It introduces session-aware logic to track consecutive `InvalidDiffError` failures for a given file. After two consecutive failures, the tool will modify its response to instruct the LLM agent to stop using `safe_patch` and instead use the `write_file` tool as a more robust fallback strategy. This prevents the agent from getting stuck in unproductive loops.

- **Verification Plan:**
  - All new logic will be verified with unit tests in `packages/core/src/tools/safe-patch.test.ts`.
  - **Test Case 1:** Verify that on the first `InvalidDiffError`, the tool returns the standard, concise error message.
  - **Test Case 2:** Verify that on the second consecutive `InvalidDiffError` for the same file, the tool returns the new, augmented error message with `error_type: "INVALID_PATCH_LIMIT_EXCEEDED"`.
  - **Test Case 3:** Verify that after a successful patch, the failure counter is reset. A subsequent `InvalidDiffError` should be treated as a first failure.
  - **Test Case 4:** Verify that after a `HASH_MISMATCH` error, the failure counter is reset. A subsequent `InvalidDiffError` should be treated as a first failure.
  - All existing tests for `safe_patch` must continue to pass.
  - The full preflight check (`npm run preflight`) must pass.

- **Planned Implementation Tasks:**

  - [ ] **Task:** Define the state structure for tracking failures in `packages/core/src/services/session-state-service.ts`. Add a `safePatchFailures` map to the session state interface.
  - [ ] **Task:** In `packages/core/src/tools/safe-patch.test.ts`, write a new failing test case that simulates a second consecutive `InvalidDiffError` and asserts that the returned `llmContent` contains the augmented message and the `INVALID_PATCH_LIMIT_EXCEEDED` error type.
  - [ ] **Task:** In `packages/core/src/tools/safe-patch.ts`, modify the `execute` method's `catch` block for `InvalidDiffError`. Implement the logic to access the `SessionStateService`, increment the failure counter for the file path, and check it against the threshold of 2.
  - [ ] **Task:** Implement the conditional logic to return the new augmented error message when the threshold is met. This should make the failing test pass.
  - [ ] **Task:** In `packages/core/src/tools/safe-patch.test.ts`, write a new test case to verify that the failure counter is reset after a successful operation.
  - [ ] **Task:** In `packages/core/src/tools/safe-patch.ts`, add the logic to reset the failure counter to 0 in the session state upon a successful patch. 
  - [ ] **Task:** In `packages/core/src/tools/safe-patch.ts`, add the logic to reset the failure counter to 0 after the augmented error message is sent.
  - [ ] **Task:** In `packages/core/src/tools/safe-patch.test.ts`, write a new test case to verify that the failure counter is reset after a `HASH_MISMATCH` error.
  - [ ] **Task:** In `packages/core/src/tools/safe-patch.ts`, add the logic to reset the failure counter to 0 when a `HASH_MISMATCH` error occurs in the `_verifyFileState` method.
  - [ ] **Task:** Run `npm run preflight` to ensure all tests, linting, and type checks pass.
