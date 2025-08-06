### **TDD Plan: Fixing Double Stringification in File-Reading Tools**

**Status:** Proposal
**Author:** gemini-agent
**Date:** August 6, 2025

---

### 1. Abstract

This document outlines a development plan to fix a critical data corruption issue caused by the "double stringification" of tool outputs from `read_file`, `read_many_files`, and the `@` operator. The current implementation pre-stringifies file content into a JSON string within the tool itself, which is then improperly escaped and re-stringified before being sent to the LLM. This plan details a test-driven approach to refactor the toolchain to pass structured objects, eliminating the root cause of the issue. The goal is to ensure the LLM receives clean, correctly formatted data for file operations, while maintaining the integrity of logging and the console UI.

### 2. Problem Statement

The `safe_patch` tool frequently fails because it receives a malformed `unified_diff` from the LLM. This malformed diff is a direct result of the LLM operating on corrupted file content. Specifically, newline characters (`\n`) in file content are being double-escaped into literal `\\n` strings. This happens because the output of file-reading tools (`read_file`, `read_many_files`) is stringified twice: once by the tool itself, and a second time by the chat history preparation logic. This prevents the LLM from correctly understanding the file's structure, leading to incorrect diff generation and subsequent tool failures.

### 3. Cause Analysis

The root cause is a multi-stage, unintentional stringification process that corrupts the data sent to the LLM.

1.  **First Stringification (Tool-Level):** The `read_file` and `read_many_files` tools construct a versioned file object (or an array of them) containing file content, path, and metadata. They then use `JSON.stringify()` to convert this entire structured object/array into a single string, which is placed in the `llmContent` field of the `ToolResult`.

2.  **Second Stringification (Payload-Level):** The `CoreToolScheduler` receives this `ToolResult`. It takes the already-stringified `llmContent` and passes it to the `convertToFunctionResponse` utility. This utility wraps the string in a `functionResponse` part. Later, when the full chat history is prepared for the API call in `geminiChat.ts`, the entire `Content` array, including the `functionResponse` part, is stringified again. This second pass escapes the backslashes in the already-stringified content (e.g., `\\n` becomes `\\\\n`), corrupting it for the LLM.

The correct approach is to pass structured data (JavaScript objects/arrays) all the way from the tool to the final payload construction, deferring the `JSON.stringify` operation to the very last moment.

### 4. Agile TDD Execution Plan

This plan will refactor the file-reading toolchain to eliminate double stringification, following a strict Test-Driven Development (TDD) workflow.

---

#### **Phase 1: Refactor File Tools to Return Structured Data**

**Goal:** Modify `read_file` and `read_many_files` to return raw JavaScript objects/arrays instead of pre-stringified JSON, and improve efficiency.

1.  **Task: Refactor `fileUtils` for Efficiency (Refactor)**
    - **Where:** `packages/core/src/utils/fileUtils.ts`.
    - **How:** Modify `createVersionedFileObject` to accept file content as a parameter (`createVersionedFileObject(filePath, content, sessionStateService)`). This avoids a redundant file read, as the calling tools will have already read the content.
    - **Assertion:** This is a pure refactoring. Existing tests should continue to pass.

2.  **Task: Write Failing Test for `read_file` (Red)**
    - **Where:** `packages/core/src/tools/read-file.test.ts`.
    - **How:**
      1.  Modify an existing test that checks the result of `tool.execute()`.
      2.  Change the assertion to check that `result.llmContent` is an `object` and not a `string`.
    - **Assertion:** The test will fail because the tool currently returns a stringified JSON object.

3.  **Task: Update `read_file` to Return an Object (Green)**
    - **Where:** `packages/core/src/tools/read-file.ts`.
    - **How:**
      1.  In `execute()`, after getting the content from `processSingleFileContent`, pass it to the refactored `createVersionedFileObject`.
      2.  Return the resulting `VersionedFile` object directly in the `llmContent` field.
    - **Assertion:** The test from the previous step will now pass.

4.  **Task: Write Failing Test for `read_many_files` (Red)**
    - **Where:** `packages/core/src/tools/read-many-files.test.ts`.
    - **How:**
      1.  Modify a test that checks the result of `tool.execute()`.
      2.  Change the assertion to check that `result.llmContent` is an `Array`, not a `string`.
    - **Assertion:** The test will fail because the tool currently returns a stringified JSON array.

5.  **Task: Update `read_many_files` to Return an Array (Green)**
    - **Where:** `packages/core/src/tools/read-many-files.ts`.
    - **How:**
      1.  In `execute()`, collect the raw `VersionedFile` objects into the `contentParts` array.
      2.  Return the `contentParts` array directly in the `llmContent` field.
    - **Assertion:** The test from the previous step will now pass.

---

#### **Phase 2: Adapt Tool Scheduler to Handle Structured Data**

**Goal:** Update the core scheduling logic to correctly process structured data from tools and format it for the Gemini API.

1.  **Task: Write Failing Integration Test (Red)**
    - **Where:** A new test file, `packages/core/src/core/scheduler-integration.test.ts`.
    - **How:**
      1.  Create a test that simulates the end-to-end flow for a tool call.
      2.  Mock a tool's `execute` method to return a structured object (e.g., `{ file_path: '...', content: '...' }`) in `llmContent`.
      3.  Instantiate and run the `CoreToolScheduler` with this mock tool.
      4.  Capture the `CompletedToolCall` and inspect its `response.responseParts`.
    - **Assertion:** Assert that the `functionResponse.response` field contains the original, unmodified structured object. The test will fail because the current implementation will incorrectly process the object.

2.  **Task: Update `CoreToolScheduler` to Handle Objects (Green)**
    - **Where:** `packages/core/src/core/coreToolScheduler.ts`.
    - **How:**
      1.  Modify `createFunctionResponsePart` to accept `response: object` instead of `output: string`. It will now directly assign this object to the `functionResponse.response` field.
      2.  Update `convertToFunctionResponse` to be polymorphic:
          - If `llmContent` is a `string`, wrap it in an object (`{ output: llmContent }`) before passing it to `createFunctionResponsePart` to maintain backward compatibility.
          - If `llmContent` is an `object` or `Array`, pass it directly to `createFunctionResponsePart`.
      3.  Update all other call sites of `createFunctionResponsePart` in the file (e.g., for default success messages) to pass an object like `{ output: 'Tool execution succeeded.' }`.
    - **Assertion:** The integration test from the previous step will now pass.

---

#### **Phase 3: Refactor and Final Verification**

**Goal:** Clean up the codebase and run full system checks to ensure correctness.

1.  **Task: Verify Logging and UI Behavior**
    - **How:** Manually inspect `geminiChat.ts` to confirm that the final API request payload logged is correctly formatted (no double-escaped characters). Verify that the `returnDisplay` property of `ToolResult` was not altered in the file-reading tools, ensuring the console UI remains correct.

2.  **Task: Verify `@` Operator**
    - **How:** Perform a codebase search to confirm the `@` file-mention operator resolves to calls to `read_file` or `read_many_files`. Since those tools are now fixed, the `@` operator's functionality will be implicitly corrected.

3.  **Task: Final Verification**
    - **How:** Run the full preflight check to ensure all changes are valid, all tests pass, and no regressions or type errors were introduced.
    - **Command:** `npm run preflight`

---

**Milestone: Double Stringification Fixed**

- **State:** Green.
- **Verification:** All unit and integration tests pass. `npm run preflight` is successful. Manual testing of `safe_patch` with files read via `read_file` or `@` confirms that the diffs are generated correctly and the tool succeeds.
