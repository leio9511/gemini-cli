## **Design Proposal: Robust Fuzzy Patching and Failure Logging**

**Status:** Implemented
**Author:** gemini-agent
**Date:** August 5, 2025
**Commit:** cad5c0631e08ebfd7a958841f4109464e3d92485

### 1. Problem Statement

The current `safe_patch` tool, while secure due to its strict SHA-256 hash verification, is overly rigid in its application of unified diffs. It fails when encountering minor, semantically irrelevant differences between the patch's context and the source file, such as variations in whitespace, line endings, or blank lines. These inconsistencies are common in LLM-generated diffs, making the `safe_patch` tool brittle and leading to unnecessary tool failures, which increases latency and degrades the user experience.

Furthermore, when a patch does fail, the system lacks a mechanism to automatically capture the problematic source and diff files. This makes debugging and improving the patching algorithm difficult, as it relies on manual reproduction of the failure case.

### 2. Goals & Expected Behavior

- **Goal 1: Increase Patching Robustness.** The `safe_patch` tool should intelligently handle common LLM-generated diff inconsistencies. It should successfully apply patches even if there are minor differences in whitespace or blank lines, mirroring the behavior of the proven `fuzzy_patch.py` script.
- **Goal 2: Maintain State Verification.** The tool must continue to use the `base_content_sha256` hash to guarantee that the patch is being applied to the correct version of the file, preventing state synchronization errors.
- **Goal 3: Implement Diagnostic Logging.** Introduce a mechanism to automatically log the source file and the failed diff to a specified directory whenever a patch application fails. This will create a valuable dataset for debugging and future improvements.

### 3. Proposed Solution

The solution is to replace the current brittle patching logic with a new, robust implementation that correctly handles both line number and content fuzziness in a single pass. This new logic will be encapsulated in a powerful `applyFuzzyPatch` function, and the `SafePatchTool` will be simplified to use it.

1.  **Create a definitive `applyFuzzyPatch` function:**
    - **Where:** `packages/core/src/utils/patchUtils.ts`
    - **How:** This function will perform a manual, line-by-line application of the diff, directly implementing the logic from the proven `fuzzy_patch.py` script. It will not use the `diff` library's `applyPatch` function.
      1.  **Parse Diff:** It will parse the `unified_diff` into hunks.
      2.  **Process Hunks Sequentially:** It will iterate through each hunk, applying its changes to an in-memory copy of the file's lines. An `offset` variable will track how the file length changes after each hunk is applied, ensuring subsequent hunks are applied at the correct, adjusted line number.
      3.  **For Each Hunk:**
          - **Find Match:** It will use the existing `findFlexibleMatch` utility to locate the _actual_ starting line of the hunk's context in the target file, ignoring the potentially incorrect line number in the hunk's header.
          - **Determine Bounds:** Once the start of the match is found, it will intelligently determine the _end_ of the block to be replaced by stepping through the source file and the hunk's context lines, accounting for extra blank lines in the source. This gives the precise `length` of the block to be spliced.
          - **Apply Splice:** It will use `Array.prototype.splice()` to replace the identified block (`matchStart`, `length`) with the new lines from the hunk.
          - **Update Offset:** The `offset` is adjusted based on the difference between the number of lines added and removed.

2.  **Simplify `SafePatchTool` to use `applyFuzzyPatch`:**
    - **Where:** `packages/core/src/tools/safe-patch.ts`
    - **How:** The `execute` method within the `SafePatchTool` will be significantly simplified. Its complex internal logic will be replaced with a single `try...catch` block that calls the new, powerful `applyFuzzyPatch` function.

3.  **Introduce `logSafePatchFailureFolder` Configuration:**
    - **Where:** `packages/core/src/config/config.ts`
    - **How:** A new optional string property, `logSafePatchFailureFolder`, will be added to the configuration.

4.  **Implement Failure Logging Logic:**
    - **Where:** `packages/core/src/tools/safe-patch.ts`
    - **How:** In the `execute` method of `SafePatchTool`, whenever `applyFuzzyPatch` throws an error, the code will check if `config.logSafePatchFailureFolder` is set.
      - If it is set, the tool will create two files in that directory:
        - `source_[timestamp].txt`: Containing the `originalContent` of the file.
        - `diff_[timestamp].txt`: Containing the `unified_diff` that failed to apply.
      - This ensures that all failed cases are automatically captured for analysis without interfering with the tool's normal error-handling flow.

### 4. Agile Implementation Plan (TDD)

---

#### **Phase 1: Implement the Definitive `applyFuzzyPatch` Utility**

**Goal:** Create the robust, single-pass fuzzy patching logic.

1.  **Task: Create Test Cases** [DONE]
    - **Where:** `packages/core/src/utils/__tests__/testdata/fuzzy-patch/`
    - **How:** Copy the existing test cases from `docs/designs/cases/*` to the new test data directory. These files represent real-world failures of the old `safe_patch` tool that the new implementation must handle.

2.  **Task: Test `applyFuzzyPatch`** [DONE]
    - **Where:** Create a new test suite in `packages/core/src/utils/patchUtils.test.ts`.
    - **How:**
      - Create tests that load the source and diff files from `packages/core/src/utils/__tests__/testdata/fuzzy-patch/`.
      - For each pair, assert that `applyFuzzyPatch` correctly applies the diff without errors.
      - Add a test case where the diff is fundamentally invalid and should correctly throw an `InvalidDiffError`.
    - **Run tests:** `npm test -w @google/gemini-cli-core -- src/utils/patchUtils.test.ts`

3.  **Task: Implement `applyFuzzyPatch`** [DONE]
    - **Where:** `packages/core/src/utils/patchUtils.ts`
    - **How:** Create the `applyFuzzyPatch` function. **For implementation guidance, closely follow the logic in the `docs/designs/fuzzy_patch.py` script.** This script contains the proven, robust algorithm for handling both line number and whitespace inconsistencies. The new TypeScript function should be a direct port of its logic.

**Check Point 1.1: `applyFuzzyPatch` is Complete** [DONE]

- **State:** Green.
- **Verification:** All tests for `applyFuzzyPatch` are passing, including those using the newly copied test cases. `npm run preflight` passes.

---

#### **Phase 2: Integrate `applyFuzzyPatch` and Implement Logging**

**Goal:** Integrate the new patching logic into the tool and add the failure logging mechanism.

1.  **Task: Add `logSafePatchFailureFolder` to Config** [DONE]
    - **Where:** `packages/core/src/config/config.ts`
    - **How:** Add the new optional `logSafePatchFailureFolder: string` property to the `Config` class and any related configuration interfaces.

2.  **Task: Update `SafePatchTool` Tests for Integration and Logging** [DONE]
    - **Where:** `packages/core/src/tools/safe-patch.test.ts`
    - **How:**
      - Simplify existing tests to mock the new, powerful `applyFuzzyPatch` and verify it is called correctly by the `execute` method.
      - Add a new test suite for failure logging.
      - In this suite, mock `applyFuzzyPatch` to throw an `InvalidDiffError`.
      - Mock the `Config` to provide a path for `logSafePatchFailureFolder`.
      - Use `vi.spyOn(fs, 'writeFile')` to assert that the tool attempts to write the `source` and `diff` files to the correct directory when the patch fails.
    - **Run tests:** `npm test -w @google/gemini-cli-core -- src/tools/safe-patch.test.ts`

3.  **Task: Update `SafePatchTool` Implementation** [DONE]
    - **Where:** `packages/core/src/tools/safe-patch.ts`
    - **How:**
      - In the `execute` method, replace the complex, multi-stage patching logic with a single, simple `try...catch` block that calls the new `applyFuzzyPatch` function.
      - In the `catch` block, add the logic to check for the `logSafePatchFailureFolder` config and write the failure files if it is set.

**Milestone: Fuzzy Patching and Logging is Fully Functional** [DONE]

- **State:** Green.
- **Verification:** All unit tests pass, and the full preflight check (`npm run preflight`) is successful. Manually test by:
  1.  Setting `logSafePatchFailureFolder` in a local config.
  2.  Using `safe_patch` with a deliberately broken diff.
  3.  Confirming that the tool returns a failure to the user.
  4.  Confirming that the `source_...` and `diff_...` files are created in the specified folder.
