## **Design Proposal: A Robust, State-Verified File Modification Toolchain**

**Status:** Proposal
**Author:** lychen@google.com
**Date:** August 3, 2025

### 1. Abstract

This document proposes a significant upgrade to the file I/O capabilities of the `gemini-cli` agent. The current `replace` tool, while simple, is prone to failure in multi-turn interactions, creating inefficient and error-prone workflows. The CLI's `@` file-injection operator suffers from the same limitation. We propose replacing the current system with a new, state-aware toolchain centered around versioned file reads and state-verified file writes. This new system will use an in-memory version counter and cryptographic hashing for state verification across all content-reading tools (`read_file`, `read_many_files`) and file-writing tools (`write_file`, and a new `safe_patch` tool). The CLI frontend's `@` operator will also be upgraded to conform to this system. This design will dramatically increase the reliability and efficiency of the agent, enable complex multi-part edits in a single operation, and provide clearer, more actionable feedback to the LLM, thereby minimizing context pollution and speeding up recovery from errors.

### 2. Background & Problem Statement

In practice, the `replace` tool is highly likely to fail during interactive sessions that involve multiple modifications to the same file. This stems from fundamental limitations in its design when used in a conversational, stateful context.

- **The Core Problem: State Synchronization Failure**
  The agent's context (its memory of a file's content, derived from chat history) can easily become stale relative to the ground truth on the file system. The `replace` tool's strict `old_string` requirement, intended as a safety measure, makes it brittle; if the LLM references a stale version of the file from its history, the `old_string` will not be found, causing the tool to fail. This forces a manual, multi-step recovery process (re-reading the file, then re-attempting the change). The `@` operator, which injects file content directly into the prompt, creates the same problem by providing un-versioned data, forcing the LLM to immediately perform a version-aware `read_file` call to get a safe context before any modification.

- **Consequence 1: Inefficient, Multi-Turn Operations for Complex Edits**
  The `replace` tool can only modify one contiguous block of text at a time. To make N distinct changes to a file, the agent must call `replace` N times. This creates a slow, serial workflow that is frustrating for the user and inefficient for the agent.

- **Consequence 2: Severe Context Pollution**
  The N-turn workflow described above pollutes the chat history. If each successful `replace` call returns the full file content to keep the agent's context up-to-date, making 5 changes to a 200-line file can add 1000 lines of nearly identical text to the context. This leads to:
  - **Increased Token Cost & Latency:** The agent must process a much larger context window on every turn.
  - **Increased LLM Confusion:** The sheer volume of redundant text creates "noise." It becomes harder for the LLM to identify the truly latest version of the file, increasing the likelihood of it referencing stale data and triggering another state synchronization failure.

- **Consequence 3: Unintended File Overwrites with `write_file`**
  A separate but related issue exists with the `write_file` tool. The LLM may attempt to use it to create a new file without first checking if a file with that name already exists. This can lead to the unintentional and destructive overwriting of existing file content, as the tool currently has no mechanism to verify the LLM's intent against the state of the file system.

The current system is caught in a cycle: its tool for modification (`replace`) is not powerful enough for complex edits, forcing a workflow that actively degrades the quality of the context the LLM relies on, which in turn causes the tool to fail more often.

### 3. Goals & Non-Goals

#### Goals

- To create a file modification system that is highly resistant to state synchronization errors.
- To enable complex, multi-part file edits in a single, atomic tool call.
- To reduce context window pollution by using a more concise change format (unified diff).
- To provide the LLM with clear, deterministic signals (session-scoped versioning and hashes) for state tracking.
- To design a self-correcting feedback loop where tool failures provide the LLM with the exact information needed to recover.
- To maintain a high degree of safety, ensuring changes are only applied when the file state is precisely what the agent expects.
- To ensure the `@` operator is a first-class, efficient citizen of the state-aware ecosystem.

#### Non-Goals

- This design does not introduce any persistent state to the user's project (e.g., no `.gemini_version` file).
- It does not change the fundamental single-threaded, turn-based nature of the agent's interaction model.
- Tools that only return file paths (`glob`, `list_directory`) or content snippets (`search_file_content`) will not be versioned, as a `read_file` or `read_many_files` call is still required to get the full content necessary for safe modification.

### 4. Proposed Design

We will implement a new, state-aware toolchain by upgrading our file I/O tools and the CLI's `@` operator handler. The guiding principle is: **Tools perform computation and state verification; the LLM performs reasoning and state carrying.**

#### 4.1. Component 1: Upgraded File Reading Tools

The file reading tools will be enhanced to become the primary source of versioned ground truth for the current session.

- **Versioning:** A session-scoped, in-memory counter will be maintained within the `gemini-cli` instance. This counter will start at 0 each time `gemini-cli` is launched and will increment for each file-read or file-write operation.

- **`read_file` Logic:** When called, `read_file` will:
  1.  Read the target file's content.
  2.  Calculate a SHA-256 hash of the content.
  3.  Increment and retrieve the current session's version number.
- **`read_file` Return Signature:** The tool will return a structured JSON object.
  ```json
  {
    "file_path": "/path/to/file.py",
    "version": 1,
    "sha256": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "content": "..."
  }
  ```
- **`read_many_files` Logic & Return Signature:** This tool will perform the same versioning and hashing for each file it reads. It will return an array of the versioned file objects described for `read_file`.
  ```json
  [
    {
      "file_path": "/path/to/file.py",
      "version": 2,
      "sha256": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      "content": "..."
    },
    {
      "file_path": "/path/to/other_file.py",
      "version": 3,
      "sha256": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
      "content": "..."
    }
  ]
  ```

#### 4.2. Component 2: The `safe_patch` Tool

This new tool will replace the existing `replace` tool. It uses a hash for pre-condition checking and a unified diff for the modification payload.

- **Tool Signature:**
  ```typescript
  safe_patch(
    file_path: string,
    unified_diff: string,
    base_content_sha256: string
  )
  ```
- **Internal Logic:**
  1.  Read the current content of `file_path` from the disk.
  2.  Calculate the SHA-256 hash of this current content.
  3.  **Verify State:** Compare the calculated hash with the `base_content_sha256` provided by the LLM.
      - **On Mismatch:** The operation fails. The tool returns a failure object that includes the _new, correct state_ of the file (see return signature below).
      - **On Match:** The state is verified. The tool applies the `unified_diff` to the content and writes the result back to the file.
- **Unified Return Signature:** The tool's return value is designed to be consistent and to automatically synchronize the LLM's context in all cases.
  ```json
  {
    "success": boolean,
    "message": "string (e.g., 'Patch applied successfully.' or 'State Mismatch: File has changed on disk.')",
    "latest_file_state": {
      "file_path": "/path/to/file.py",
      "version": number, // The new version number from the in-memory counter
      "sha256": "string", // The SHA-256 hash of the final content on disk
      "content": "string" // The full final content on disk
    }
  }
  ```

#### 4.3. Component 3: Upgraded `write_file` Tool

To prevent accidental file overwrites, the `write_file` tool will be upgraded to use the same state-verification mechanism as `safe_patch`.

- **Tool Signature:**
  ```typescript
  write_file(
    file_path: string,
    content: string,
    base_content_sha256?: string // Optional
  )
  ```
- **Internal Logic:**
  1.  Check if `file_path` exists on disk.
  2.  **If file exists:**
      - A `base_content_sha256` **must** be provided. If it is not, the operation fails with an error indicating that the LLM is attempting to overwrite an existing file without declaring its state.
      - Read the current content of `file_path` and calculate its SHA-256 hash.
      - Compare the calculated hash with the provided `base_content_sha256`.
      - **On Mismatch:** Fail with a "State Mismatch" error, returning the `latest_file_state`.
      - **On Match:** Write the new content to the file.
  3.  **If file does not exist:**
      - The `base_content_sha256` parameter is ignored (or can be validated against the hash of an empty string).
      - Create and write the new file.
- **Unified Return Signature:** The tool will return the same `latest_file_state` object as `safe_patch` on success or failure, ensuring the LLM always receives the ground truth.

#### 4.4. The LLM Agent's Expected Workflow

This section describes the intelligent, emergent workflow we expect the LLM to adopt by following the detailed, just-in-time instructions provided in the tools' `description` fields. This is not a separate system prompt, but rather a clarification of the intended behavior for human readers of this document.

1.  **Goal:** Modify a file.
2.  **Scan Context:** The LLM first scans its chat history for the target file, looking for the entry with the **highest `version` number**.
3.  **Decide:**
    - **If a versioned entry is found:** The LLM uses the `content` and `sha256` from that entry to generate a `unified_diff` and call `safe_patch`. It does **not** call `read_file`.
    - **If no versioned entry is found:** The LLM knows it lacks safe context and its first action must be to call `read_file` (or `read_many_files`) to get it. Using the `@` operator in the prompt achieves the same outcome.
4.  **Process Result:** The LLM always receives a `latest_file_state` object from `safe_patch`.
    - On success, it uses this new state for subsequent operations and can self-verify the change.
    - On a state mismatch failure, it uses the provided `latest_file_state` to immediately retry the patch, enabling rapid, single-turn recovery.

### 5. Detailed Design

This plan is based on the existing structure of the `gemini-cli` codebase.

1.  **Introduce Session State Service:**
    - **Where:** Create a new service `packages/core/src/services/session-state-service.ts`.
    - **How:** This service will be a simple class responsible for managing the session-scoped version counter.

      ```typescript
      export class SessionStateService {
        private versionCounter = 0;

        public getNextVersion(): number {
          this.versionCounter++;
          return this.versionCounter;
        }
      }
      ```

    - It will be instantiated once in the `Config` class (`packages/core/src/config/config.ts`) and passed to the tools that need it, ensuring a single counter per `gemini-cli` session.

2.  **Create a Reusable File Versioning Utility (DRY Principle):**
    - **Goal:** To avoid duplicating the versioning and hashing logic, we will create a single, reusable function that both `ReadFileTool` and `ReadManyFilesTool` will use.
    - **Where:** This logic could be implemented as a new, private helper method within a shared service that both tools have access to, for instance, a new `FileService`. A simpler approach is to create a static helper function. For the purpose of this design, let's define it as a utility function.
    - **How:** Create a new utility function, for example `createVersionedFileObject`, in a suitable location like `packages/core/src/utils/fileUtils.ts`.

      ```typescript
      // In a new or existing utility file
      import * as fs from 'fs/promises';
      import * as crypto from 'crypto';
      import { SessionStateService } from '../services/session-state-service';

      export async function createVersionedFileObject(
        filePath: string,
        sessionStateService: SessionStateService,
      ): Promise<{
        file_path: string;
        version: number;
        sha256: string;
        content: string;
      }> {
        const content = await fs.readFile(filePath, 'utf-8');
        const sha256 = crypto
          .createHash('sha256')
          .update(content)
          .digest('hex');
        const version = sessionStateService.getNextVersion();

        return {
          file_path: filePath,
          version,
          sha256,
          content,
        };
      }
      ```

3.  **Upgrade `ReadFileTool`:**
    - **Where:** `packages/core/src/tools/read-file.ts`.
    - **How:**
      - The `ReadFileTool` constructor will accept an instance of `SessionStateService`.
      - The `execute` method will be simplified to call the new utility function: `createVersionedFileObject(filePath, this.sessionStateService)`.
      - It will return the resulting structured JSON object directly.

4.  **Upgrade `ReadManyFilesTool`:**
    - **Where:** `packages/core/src/tools/read-many-files.ts`.
    - **How:**
      - The `ReadManyFilesTool` constructor will also accept an instance of `SessionStateService`.
      - The `execute` method will iterate through the list of requested file paths. For each path, it will call the `createVersionedFileObject(path, this.sessionStateService)` utility function.
      - It will collect the results into an array and return that array of structured JSON objects.

5.  **Implement `SafePatchTool`:**
    - **Where:** Create a new file `packages/core/src/tools/safe-patch.ts`.
    - **How:**
      - Create a new `SafePatchTool` class extending `BaseTool`.
      - The constructor will accept `Config` and `SessionStateService` instances.
      - **Detailed Execution Flow & Error Handling:** The `execute` method will be structured with multiple, distinct exit points to provide clear feedback to the LLM.
        1.  **State Verification (Hash Check):**
            - Read the live file content and calculate its SHA-256 hash.
            - **If hashes mismatch:** Immediately fail. Return `success: false` with `message: "State Mismatch: File has changed on disk since it was last read."` and include the `latest_file_state` of the live file for immediate recovery.
        2.  **"Fix the Diff" Stage:**
            - Take the LLM's `unified_diff` and the known-good original content (from the hash match).
            - Programmatically find the true line numbers for each hunk by matching the context and removal lines (` ` and `-`).
            - **If a hunk's context/removal lines cannot be found in the original content:** The diff is fundamentally flawed. Fail with `success: false` and `message: "Invalid Diff: The provided diff content does not match the file's content. The context or lines to be removed may be incorrect."`. The `latest_file_state` will be the _unchanged_ original file state.
            - If successful, generate a new, corrected `unified_diff` in memory.
        3.  **"Apply Strict Patch" Stage:**
            - Use the `diff` library's strict `applyPatch` function on the _corrected_ diff.
            - The `applyPatch` function itself can return `false` if it fails for an unexpected reason (e.g., a bug in the library or a subtle diff format error).
            - **If `applyPatch` fails:** This is an unexpected internal error. Fail with `success: false` and `message: "Internal Error: The corrected patch failed to apply. Please review the diff for subtle errors."`. The `latest_file_state` will be the _unchanged_ original file state.
        4.  **Success:**
            - If the patch applies successfully, write the new content to disk.
            - Return `success: true` with `message: "Patch applied successfully."` and the `latest_file_state` containing the newly written content, hash, and version.
      - **Dependency:** The `diff` library's `applyPatch` function **MUST** be used for the final, strict application step. The "Fix the Diff" logic will need to be implemented as a new utility function.

6.  **Upgrade `WriteFileTool`:**
    - **Where:** `packages/core/src/tools/write-file.ts`.
    - **How:**
      - The `WriteFileTool` constructor will accept an instance of `SessionStateService`.
      - The `execute` method will be updated to implement the logic described in "Component 3: Upgraded `write_file` Tool".
      - It will check for the file's existence and validate the `base_content_sha256` if the file exists.
      - On success, it will write the file and then use a helper function (potentially a new `createVersionedFileObjectFromContent` to avoid re-reading from disk) to construct and return the `latest_file_state` object.
      - On failure (hash mismatch or missing hash for existing file), it will return the appropriate error message along with the `latest_file_state`.

7.  **Update CLI Frontend for `@` Operator:**
    - **Where:** `packages/cli/src/ui/hooks/atCommandProcessor.ts`.
    - **How:** The `handleAtCommand` function currently calls the `read_many_files` tool and processes its string output. This function must be modified to handle the new return type. It will now receive an array of versioned JSON objects. Its responsibility is to parse this array and format the structured data (including file path, version, hash, and content) into the prompt sent to the LLM, ensuring the LLM receives the full "versioned ground truth" without needing a follow-up tool call.

8.  **Integrate with Gemini-CLI Console UI:**
    - **Where:** Within the new `packages/core/src/tools/safe-patch.ts` file.
    - **How:** The existing UI confirmation flow for `replace` and `write_file` can be reused seamlessly. This is handled by the `shouldConfirmExecute` method.
      - The `SafePatchTool` will implement a `shouldConfirmExecute` method.
      - Inside this method, it will first perform the SHA-256 hash check. If the check fails, it will return `false` to prevent the confirmation from appearing.
      - If the hash check passes, it will read the original file content and use the `unified_diff` provided by the LLM.
      - It will then construct and return a `ToolEditConfirmationDetails` object, just as the current tools do. The `fileDiff` property of this object will be the `unified_diff` from the LLM's parameters.
      - The existing `gemini-cli` console logic will automatically render this object as an interactive diff for the user to approve or deny, requiring no changes to the core UI code.

9.  **Register New/Modified Tools:**
    - **Where:** `packages/core/src/config/config.ts`, within the `createToolRegistry` method.
    - **How:**
      - The `ReadFileTool`, `ReadManyFilesTool`, and `WriteFileTool` registrations will be updated to pass the `SessionStateService` instance.
      - A new line will be added: `registerCoreTool(SafePatchTool, this, this.sessionStateService)`.
      - The line for `registerCoreTool(EditTool, this)` will be removed to deprecate the old tool.

### 6. LLM Guidance and Tool Discovery

The `gemini-cli` model does not use a single, global "system prompt." Instead, each tool's `description` field serves as the just-in-time prompt for the LLM, defining the agent's workflow. This is the correct and established mechanism for providing LLM guidance.

- **Action:** The `description` fields for the affected tools will be meticulously crafted to include the new workflow instructions.
- **`read_file` description update:**
  > "Reads the content of a file and returns it along with a session-unique version number and a SHA-256 hash. This versioned data is required for safely modifying files with the `safe_patch` tool."
- **`read_many_files` description update:**
  > "Reads the content of multiple files and returns an array of objects, where each object contains the file content along with a session-unique version number and a SHA-256 hash. This versioned data is required for safely modifying files."
- **`safe_patch` description:**
  > "Applies a set of changes to a file using a unified diff patch. This is the preferred tool for all file modifications.
  >
  > **Usage Protocol:**
  >
  > 1.  To use this tool, you must operate on the latest version of the file available in your context. Identify this by finding the file content with the **highest version number**.
  > 2.  If no versioned content is available, you **MUST** call `read_file` or `read_many_files` first to get it.
  > 3.  When generating the `unified_diff`, you **MUST** include at least 10 lines of unchanged context around each change hunk (equivalent to `diff -U 10`) to ensure the patch can be applied reliably.
  > 4.  You **MUST** provide the `sha256` hash that was returned with that version as the `base_content_sha256` parameter. This hash acts as a lock; the operation will fail if the file has been modified since you read it."
- **`write_file` description:**
  > "Writes content to a file. This tool is for creating new files or completely overwriting existing ones.
  >
  > **Usage Protocol:**
  >
  > 1.  **To create a new file:** Call the tool with the desired `file_path` and `content`. Do not provide a `base_content_sha256`.
  > 2.  **To overwrite an existing file:** You **MUST** first have the latest versioned content of the file (from `read_file` or a previous tool call). You **MUST** provide the `sha256` from that version as the `base_content_sha256`. This prevents accidental overwrites of files that have changed.
  > 3.  If you attempt to write to an existing file path without providing a `base_content_sha256`, the operation will fail as a safety measure."


This approach embeds the instructions directly with the tool definition, which is the idiomatic pattern for `gemini-cli`. The LLM will always receive the latest instructions and state from the tool's output, enabling it to self-correct and follow the protocol.

### 7. Test Plan

Testing will follow the existing project convention of co-locating `*.test.ts` files with the source files, using the `vitest` framework. The plan is designed to test each component's specific responsibility.

1.  **`SessionStateService` Tests (`packages/core/src/services/session-state-service.test.ts`):**
    - A new test file will be created.
    - Test that `getNextVersion()` starts at 1 and increments correctly on subsequent calls.
    - Test that a new instance of the service resets the counter to 0.

2.  **`createVersionedFileObject` Utility Tests (`packages/core/src/utils/fileUtils.test.ts`):**
    - A new test suite will be created for the new reusable utility function.
    - This suite will be responsible for testing the core versioning logic in isolation.
    - **Test Correctness:** For a known file content, verify that the function correctly reads the content, calculates the expected SHA-256 hash, and calls the mocked `sessionStateService.getNextVersion()` once.
    - **Test Structure:** Assert that the returned object has the correct structure and contains the correct `file_path`, `version`, `sha256`, and `content`.
    - **Error Handling:** Test how the function behaves if `fs.readFile` throws an error (e.g., file not found).
    - Mocks for `fs` and `SessionStateService` will be required here.

3.  **`ReadFileTool` Tests (`packages/core/src/tools/read-file.test.ts`):**
    - The existing test file will be modified.
    - **Test Orchestration, Not Implementation:** These tests will now mock the `createVersionedFileObject` utility function.
    - Verify that the tool's `execute` method calls `createVersionedFileObject` exactly once with the correct `filePath` and `sessionStateService` instance.
    - Assert that the tool returns the exact object that the mocked utility function provides.

4.  **`ReadManyFilesTool` Tests (`packages/core/src/tools/read-many-files.test.ts`):**
    - The existing test file will be modified.
    - **Test Orchestration, Not Implementation:** These tests will also mock the `createVersionedFileObject` utility function.
    - Verify that the tool's `execute` method iterates through the input paths and calls `createVersionedFileObject` for each one.
    - Assert that the tool returns an array containing the exact objects that the mocked utility function provides, in the correct order.

5.  **`SafePatchTool` Tests (`packages/core/src/tools/safe-patch.test.ts`):**
    - A new test file will be created to cover the multi-stage logic of the tool.
    - **Success Case (Correct Patch):** Test that a valid, correct patch is applied successfully when the `base_content_sha256` matches. Verify the new content and the successful return object.
    - **Success Case (Corrected Patch):** Test that a patch with an intentionally incorrect line number but correct context lines is successfully "fixed" and applied. Verify the final content is correct.
    - **Failure Case (Hash Mismatch):** Test that the tool fails immediately if the provided hash does not match the live file's hash. Verify the file is unchanged and the specific "State Mismatch" error is returned along with the `latest_file_state`.
    - **Failure Case (Invalid Diff Content):** Test that the tool fails during the "Fix the Diff" stage. Provide a valid hash but a `unified_diff` where the context or removal lines do not exist in the source content. Verify the file is unchanged and the specific "Invalid Diff" error message is returned.
    - **Failure Case (Internal Patch Error):** Use `vi.spyOn` to mock the `applyPatch` function from the `diff` library and force it to return `false`. Test that the tool correctly catches this and returns the "Internal Error" message.
    - **File Creation Case:** Test that the tool can create a new file when the original file does not exist (the hash of an empty string can be used as the base).

6.  **`atCommandProcessor` Tests (`packages/cli/src/ui/hooks/atCommandProcessor.test.ts`):**
    - The existing test file will be modified.
    - Mock the `read_many_files` tool to return the new structured data (an array of versioned JSON objects).
    - Add a new test to verify that the `handleAtCommand` function correctly parses this new structure and formats it into the `processedQuery` parts sent to the LLM, ensuring all versioning information is present.

### 8. Agile Implementation Plan (TDD Flow)

This plan breaks down the implementation into distinct phases, each ending with a verifiable milestone. This approach allows for iterative development and early integration testing. A junior engineer should be able to follow these tasks sequentially.

---

#### **Phase 1: Core Services & Versioned Reading (The Foundation)**

**Goal:** Establish the non-user-facing backbone of the system by creating the versioning service and the reusable logic for creating versioned file objects.

**Tasks (in TDD order):**

1.  **Task: Test `SessionStateService`** [DONE]
    - Create `packages/core/src/services/session-state-service.test.ts`.
    - Write tests to verify that `getNextVersion()` starts at 1, increments correctly on subsequent calls, and that a new service instance resets the counter.
    - **How to run tests:**
      ```bash
      npm test -w @google/gemini-cli-core -- src/services/session-state-service.test.ts
      ```

2.  **Task: Implement `SessionStateService`** [DONE]
    - Create `packages/core/src/services/session-state-service.ts`.
    - Write the `SessionStateService` class with the `versionCounter` and `getNextVersion` method to make the tests pass.
    - Instantiate it within the `Config` class (`packages/core/src/config/config.ts`) so it can be passed to tools.

**Check Point 1.1: `SessionStateService` is Complete** [DONE]

- **State:** Green.
- **Verification:** All tests for `SessionStateService` are passing (`npm test -w @google/gemini-cli-core -- src/services/session-state-service.test.ts`). The full preflight check (`npm run preflight`) passes, confirming no regressions. After preflight passes, run "git status" to review changes made so far. (Completed in commit cf236350)
- **Action:** Code is ready for review. Must run `git commit` to commit change.

3.  **Task: Test the `createVersionedFileObject` Utility** [DONE]
    - In a relevant existing test file like `packages/core/src/utils/fileUtils.test.ts` (or a new one), add a test suite for the new `createVersionedFileObject` utility.
    - Write tests that mock `fs` and `SessionStateService`. Verify that for a given file path, the utility correctly reads the file, calls for a version number, calculates the correct SHA-256 hash, and returns a perfectly structured JSON object.
    - **How to run tests:**
      ```bash
      npm test -w @google/gemini-cli-core -- src/utils/fileUtils.test.ts
      ```

4.  **Task: Implement the `createVersionedFileObject` Utility** [DONE]
    - In `packages/core/src/utils/fileUtils.ts` (or a similar new utility file), create the `async function createVersionedFileObject(...)`.
    - Implement the logic using `fs.readFile`, `crypto`, and the `SessionStateService` to make the tests pass.

**Check Point 1.2: Versioning Utility is Complete** [DONE]

- **State:** Green.
- **Verification:** All tests for the utility are passing (`npm test -w @google/gemini-cli-core -- src/utils/fileUtils.test.ts`). The full preflight check (`npm run preflight`) passes. After preflight passes, run "git status" to review changes made so far. (Completed in commit e68535d3)
- **Action:** Code is ready for review. Must run `git commit` to commit change.

5.  **Task: Refactor `ReadFileTool` Tests**
    - Modify `packages/core/src/tools/read-file.test.ts`.
    - Remove mocks for `fs` and `crypto`. Instead, mock the new `createVersionedFileObject` utility.
    - Update the tests to only verify that the tool's `execute` method calls the utility function once with the correct parameters and returns whatever the mock provides.
    - **How to run tests:**
      ```bash
      npm test -w @google/gemini-cli-core -- src/tools/read-file.test.ts
      ```

6.  **Task: Refactor `ReadFileTool` Implementation**
    - Modify `packages/core/src/tools/read-file.ts`.
    - Update its constructor to accept the `SessionStateService`.
    - Simplify the `execute` method to a single call to the `createVersionedFileObject` utility.

**Check Point 1.3: `ReadFileTool` is Version-Aware**

- **State:** Green.
- **Verification:** All tests for `ReadFileTool` are passing (`npm test -w @google/gemini-cli-core -- src/tools/read-file.test.ts`). The full preflight check (`npm run preflight`) passes. After preflight passes, run "git status" to review changes made so far.
- **Action:** Code is ready for review. Must run `git commit` to commit change.

7.  **Task: Refactor `ReadManyFilesTool` Tests & Implementation**
    - Follow the same TDD pattern as for `ReadFileTool`: first update the tests in `packages/core/src/tools/read-many-files.test.ts` to mock the utility, then refactor the implementation in `packages/core/src/tools/read-many-files.ts` to use it in a loop.
    - **How to run tests:**
      ```bash
      npm test -w @google/gemini-cli-core -- src/tools/read-many-files.test.ts
      ```

**Milestone 1: Verifiable Versioned Reads**

- **State:** Green.
- **Verification:** At this stage, the core logic is complete. All unit tests are passing and the full preflight check (`npm run preflight`) is successful. After preflight passes, run "git status" to review changes made so far. Correctness can be verified by writing a small, temporary integration test script. This script should:
  1.  Instantiate the `Config` and get the `ReadFileTool` and `ReadManyFilesTool`.
  2.  Call `execute` on both tools for known files.
  3.  Assert that the returned `llmContent` is the new structured JSON (or an array of them).
  4.  Assert that the `version` number increments sequentially across multiple tool calls.
- **Action:** Phase 1 is ready for a final review. Must run `git commit` to commit change.

---

#### **Phase 2: Frontend Integration (`@` Operator)**

**Goal:** Connect the versioned reading foundation to the user-facing `@` operator.

**Tasks (in TDD order):**

1.  **Task: Update `@` Processor Tests**
    - Modify `packages/cli/src/ui/hooks/atCommandProcessor.test.ts`.
    - In the tests for `handleAtCommand`, mock the `read_many_files` tool.
    - Change the mock's return value to be the new array of structured JSON objects.
    - Write assertions to verify that the `processedQuery` parts passed to the LLM now contain the fully formatted, structured versioned data.
    - **How to run tests:**
      ```bash
      npm test -w @google/gemini-cli -- src/ui/hooks/atCommandProcessor.test.ts
      ```

2.  **Task: Update `@` Processor Implementation**
    - Modify the `handleAtCommand` function in `packages/cli/src/ui/hooks/atCommandProcessor.ts`.
    - Update the logic that processes the result from `read_many_files` to handle the array of JSON objects instead of an array of strings. Ensure it formats this structured data correctly into the final prompt.

**Check Point 2.1: `@` Processor is Version-Aware**

- **State:** Green.
- **Verification:** All tests for the `@` processor are passing (`npm test -w @google/gemini-cli -- src/ui/hooks/atCommandProcessor.test.ts`). The full preflight check (`npm run preflight`) passes. After preflight passes, run "git status" to review changes made so far.
- **Action:** Code is ready for review. Must run `git commit` to commit change.

**Milestone 2: `@` Operator is State-Aware**

- **Verification:** This change is now user-visible.
  1.  Run the `gemini-cli` executable.
  2.  Execute a prompt containing an `@` command (e.g., `gemini "Summarize this file: @/path/to/file.txt"`).
  3.  Using the debug logs (`--debug` flag), inspect the final prompt being sent to the model.
  4.  **Confirm** that the file content has been injected as a structured JSON block containing `file_path`, `version`, `sha256`, and `content`.
- **Action:** Phase 2 is ready for a final review. Must run `git commit` to commit change.

---

#### **Phase 3: State-Aware Modification (`safe_patch`)**

**Goal:** Implement the new, safe file modification tool and integrate it into the CLI.

**Tasks (in TDD order):**

1.  **Task: Test `SafePatchTool`**
    - Create `packages/core/src/tools/safe-patch.test.ts`.
    - Write comprehensive tests for all success and failure cases as detailed in the "Test Plan" section (hash mismatch, invalid diff, internal errors, etc.).
    - **How to run tests:**
      ```bash
      npm test -w @google/gemini-cli-core -- src/tools/safe-patch.test.ts
      ```

2.  **Task: Implement `SafePatchTool`**
    - Create `packages/core/src/tools/safe-patch.ts`.
    - Implement the `SafePatchTool` class and its `execute` method, including the state verification, "Fix the Diff", and "Apply Strict Patch" stages, to make the tests pass.

**Check Point 3.1: `SafePatchTool` Logic is Complete**

- **State:** Green.
- **Verification:** All tests for `SafePatchTool` are passing (`npm test -w @google/gemini-cli-core -- src/tools/safe-patch.test.ts`). The full preflight check (`npm run preflight`) passes. After preflight passes, run "git status" to review changes made so far.
- **Action:** Code is ready for review. Must run `git commit` to commit change.

3.  **Task: Implement UI Confirmation**
    - Implement the `shouldConfirmExecute` method within `SafePatchTool` to handle the interactive diff confirmation.

**Check Point 3.2: UI Confirmation is Integrated**

- **State:** Green.
- **Verification:** The `shouldConfirmExecute` method is implemented and covered by tests. The full preflight check (`npm run preflight`) passes. After preflight passes, run "git status" to review changes made so far.
- **Action:** Code is ready for review. Must run `git commit` to commit change.

4.  **Task: Register `SafePatchTool`**
    - In `packages/core/src/config/config.ts`, register the new `SafePatchTool` and pass it the `SessionStateService`.
    - Remove the registration for the old `EditTool`.

**Check Point 3.3: `SafePatchTool` is Registered**

- **State:** Green.
- **Verification:** The tool is correctly registered in the `Config` and the old tool is removed. This can be verified by running the CLI and checking the `/tools` command output. The full preflight check (`npm run preflight`) passes. After preflight passes, run "git status" to review changes made so far.
- **Action:** Code is ready for review. Must run `git commit` to commit change.

**Milestone 3: Safe, Atomic Patching is Functional**

- **Verification:** The primary modification workflow is now testable end-to-end.
  1.  Run `gemini-cli`.
  2.  Use the `@` operator to read a file into context.
  3.  Ask the LLM to make a change to that file.
  4.  **Confirm** that the interactive diff confirmation for `safe_patch` appears.
  5.  Approve the change and verify the file is correctly modified on disk.
  6.  Test the state mismatch case: read a file with `@`, modify it manually in a separate editor, then ask the LLM to patch it. **Confirm** the tool call fails with the "State Mismatch" error in the CLI.
- **Action:** Phase 3 is ready for a final review. Must run `git commit` to commit change.

---

#### **Phase 4: Finalizing the Toolchain (`write_file` and Documentation)**

**Goal:** Upgrade the remaining file-writing tool and update all LLM guidance.

**Tasks (in TDD order):**

1.  **Task: Update `WriteFileTool` Tests**
    - In `packages/core/src/tools/write-file.test.ts`, rewrite the tests to cover the new state-aware logic comprehensively.
    - **Test Create:** Verify the tool correctly creates a new file when the path does not exist and no `base_content_sha256` is provided. Assert that the returned `latest_file_state` is correct.
    - **Test Safe Overwrite:** Verify the tool correctly overwrites an existing file when the correct `base_content_sha256` is provided. Assert the file content is updated and the returned `latest_file_state` is correct.
    - **Test Failure (Missing Hash):** Verify the tool fails with a specific error message if it's called on an existing file path *without* providing a `base_content_sha256`. Assert the file is unchanged and the returned `latest_file_state` reflects the unchanged file.
    - **Test Failure (Hash Mismatch):** Verify the tool fails with a "State Mismatch" error if the provided `base_content_sha256` does not match the on-disk file's hash. Assert the file is unchanged and the returned `latest_file_state` contains the new, correct state information from the disk.
    - **Test Return Value:** In all cases (success or failure), verify the tool returns a `success` boolean and the `latest_file_state` object with the correct, up-to-date `file_path`, `version`, `sha256`, and `content`.
    - **How to run tests:**
      ```bash
      npm test -w @google/gemini-cli-core -- src/tools/write-file.test.ts
      ```

2.  **Task: Update `WriteFileTool` Implementation**
    - Modify `packages/core/src/tools/write-file.ts`.
    - Update the constructor to accept the `SessionStateService`.
    - Implement the full state-aware logic in the `execute` method:
      1. Check for file existence.
      2. If it exists, check for `base_content_sha256`. Fail if absent.
      3. If hash is present, read the file, calculate its hash, and compare. Fail on mismatch.
      4. If checks pass (or if it's a new file), write the content to disk.
      5. In every exit path (success or failure), construct and return the full, consistent return object, including `success`, `message`, and `latest_file_state`. Use a helper to create the `latest_file_state` to ensure consistency.

**Check Point 4.1: `WriteFileTool` is State-Aware**

- **State:** Green.
- **Verification:** All tests for `WriteFileTool` are passing (`npm test -w @google/gemini-cli-core -- src/tools/write-file.test.ts`). The full preflight check (`npm run preflight`) passes. After preflight passes, run "git status" to review changes made so far.
- **Action:** Code is ready for review. Must run `git commit` to commit change.

3.  **Task: Update LLM Guidance**
    - Update the `description` fields for `read_file`, `read_many_files`, `safe_patch`, and `write_file` as detailed in the "LLM Guidance and Tool Discovery" section.

**Check Point 4.2: LLM Guidance is Updated**

- **State:** Green.
- **Verification:** The `description` fields in the tool definitions have been updated. This can be verified by running the CLI and inspecting the output of the `/tools` command.
- **Action:** Documentation change is ready for review. Must run `git commit` to commit change.

**Milestone 4: Fully State-Aware I/O Toolchain**

- **Verification:** The entire feature set is now complete.
  1.  Perform full end-to-end manual testing of all read and write/patch flows.
  2.  Test the `write_file` tool's new safety feature by attempting to overwrite a file with an incorrect hash, and also by attempting to overwrite an existing file without a hash.
  3.  Review the output of the `/tools` command in the CLI to ensure the new tool descriptions are clear and accurate.
  4.  The project is now considered feature-complete.
