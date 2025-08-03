## **Design Proposal: A Robust, State-Verified File Modification Toolchain**

**Status:** Proposal
**Author:** lychen@google.com
**Date:** August 3, 2025

### 1. Abstract

This document proposes a significant upgrade to the file I/O capabilities of the `gemini-cli` agent. The current `replace` tool, while simple, is prone to failure in multi-turn interactions, creating inefficient and error-prone workflows. The CLI's `@` file-injection operator suffers from the same limitation. We propose replacing the current system with a new, state-aware toolchain centered around versioned file reads and state-verified file writes. This new system will use an in-memory version counter and cryptographic hashing for state verification across all content-reading tools (`read_file`, `read_many_files`) and file-writing tools (`write_file`, and a new `safe_patch` tool). The CLI frontend's `@` operator will also be upgraded to conform to this system. This design will dramatically increase the reliability and efficiency of the agent, enable complex multi-part edits in a single operation, and provide clearer, more actionable feedback to the LLM, thereby minimizing context pollution and speeding up recovery from errors.

### 2. Background & Problem Statement

In practice, the `replace` tool is highly likely to fail during interactive sessions that involve multiple modifications to the same file. This stems from fundamental limitations in its design when used in a conversational, stateful context.

*   **The Core Problem: State Synchronization Failure**
    The agent's context (its memory of a file's content, derived from chat history) can easily become stale relative to the ground truth on the file system. The `replace` tool's strict `old_string` requirement, intended as a safety measure, makes it brittle; if the LLM references a stale version of the file from its history, the `old_string` will not be found, causing the tool to fail. This forces a manual, multi-step recovery process (re-reading the file, then re-attempting the change). The `@` operator, which injects file content directly into the prompt, creates the same problem by providing un-versioned data, forcing the LLM to immediately perform a version-aware `read_file` call to get a safe context before any modification.

*   **Consequence 1: Inefficient, Multi-Turn Operations for Complex Edits**
    The `replace` tool can only modify one contiguous block of text at a time. To make N distinct changes to a file, the agent must call `replace` N times. This creates a slow, serial workflow that is frustrating for the user and inefficient for the agent.

*   **Consequence 2: Severe Context Pollution**
    The N-turn workflow described above pollutes the chat history. If each successful `replace` call returns the full file content to keep the agent's context up-to-date, making 5 changes to a 200-line file can add 1000 lines of nearly identical text to the context. This leads to:
    *   **Increased Token Cost & Latency:** The agent must process a much larger context window on every turn.
    *   **Increased LLM Confusion:** The sheer volume of redundant text creates "noise." It becomes harder for the LLM to identify the truly latest version of the file, increasing the likelihood of it referencing stale data and triggering another state synchronization failure.

The current system is caught in a cycle: its tool for modification (`replace`) is not powerful enough for complex edits, forcing a workflow that actively degrades the quality of the context the LLM relies on, which in turn causes the tool to fail more often.

### 3. Goals & Non-Goals

#### Goals

*   To create a file modification system that is highly resistant to state synchronization errors.
*   To enable complex, multi-part file edits in a single, atomic tool call.
*   To reduce context window pollution by using a more concise change format (unified diff).
*   To provide the LLM with clear, deterministic signals (session-scoped versioning and hashes) for state tracking.
*   To design a self-correcting feedback loop where tool failures provide the LLM with the exact information needed to recover.
*   To maintain a high degree of safety, ensuring changes are only applied when the file state is precisely what the agent expects.
*   To ensure the `@` operator is a first-class, efficient citizen of the state-aware ecosystem.

#### Non-Goals

*   This design does not introduce any persistent state to the user's project (e.g., no `.gemini_version` file).
*   It does not change the fundamental single-threaded, turn-based nature of the agent's interaction model.
*   Tools that only return file paths (`glob`, `list_directory`) or content snippets (`search_file_content`) will not be versioned, as a `read_file` or `read_many_files` call is still required to get the full content necessary for safe modification.

### 4. Proposed Design

We will implement a new, state-aware toolchain by upgrading our file I/O tools and the CLI's `@` operator handler. The guiding principle is: **Tools perform computation and state verification; the LLM performs reasoning and state carrying.**

#### 4.1. Component 1: Upgraded File Reading Tools

The file reading tools will be enhanced to become the primary source of versioned ground truth for the current session.

*   **Versioning:** A session-scoped, in-memory counter will be maintained within the `gemini-cli` instance. This counter will start at 0 each time `gemini-cli` is launched and will increment for each file-read or file-write operation.

*   **`read_file` Logic:** When called, `read_file` will:
    1.  Read the target file's content.
    2.  Calculate a SHA-256 hash of the content.
    3.  Increment and retrieve the current session's version number.
*   **`read_file` Return Signature:** The tool will return a structured JSON object.
    ```json
    {
      "file_path": "/path/to/file.py",
      "version": 1,
      "sha256": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      "content": "..."
    }
    ```
*   **`read_many_files` Logic & Return Signature:** This tool will perform the same versioning and hashing for each file it reads. It will return an array of the versioned file objects described for `read_file`.
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

*   **Tool Signature:**
    ```typescript
    safe_patch(
      file_path: string,
      unified_diff: string,
      base_content_sha256: string
    )
    ```
*   **Internal Logic:**
    1.  Read the current content of `file_path` from the disk.
    2.  Calculate the SHA-256 hash of this current content.
    3.  **Verify State:** Compare the calculated hash with the `base_content_sha256` provided by the LLM.
        *   **On Mismatch:** The operation fails. The tool returns a failure object that includes the *new, correct state* of the file (see return signature below).
        *   **On Match:** The state is verified. The tool applies the `unified_diff` to the content and writes the result back to the file.
*   **Unified Return Signature:** The tool's return value is designed to be consistent and to automatically synchronize the LLM's context in all cases.
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

#### 4.3. The LLM Agent's Expected Workflow

This section describes the intelligent, emergent workflow we expect the LLM to adopt by following the detailed, just-in-time instructions provided in the tools' `description` fields. This is not a separate system prompt, but rather a clarification of the intended behavior for human readers of this document.

1.  **Goal:** Modify a file.
2.  **Scan Context:** The LLM first scans its chat history for the target file, looking for the entry with the **highest `version` number**.
3.  **Decide:**
    *   **If a versioned entry is found:** The LLM uses the `content` and `sha256` from that entry to generate a `unified_diff` and call `safe_patch`. It does **not** call `read_file`.
    *   **If no versioned entry is found:** The LLM knows it lacks safe context and its first action must be to call `read_file` (or `read_many_files`) to get it. Using the `@` operator in the prompt achieves the same outcome.
4.  **Process Result:** The LLM always receives a `latest_file_state` object from `safe_patch`.
    *   On success, it uses this new state for subsequent operations and can self-verify the change.
    *   On a state mismatch failure, it uses the provided `latest_file_state` to immediately retry the patch, enabling rapid, single-turn recovery.

### 5. Detailed Design & Implementation Plan

This plan is based on the existing structure of the `gemini-cli` codebase.

1.  **Introduce Session State Service:**
    *   **Where:** Create a new service `packages/core/src/services/session-state-service.ts`.
    *   **How:** This service will be a simple class responsible for managing the session-scoped version counter.
        ```typescript
        export class SessionStateService {
          private versionCounter = 0;

          public getNextVersion(): number {
            this.versionCounter++;
            return this.versionCounter;
          }
        }
        ```
    *   It will be instantiated once in the `Config` class (`packages/core/src/config/config.ts`) and passed to the tools that need it, ensuring a single counter per `gemini-cli` session.

2.  **Upgrade `ReadFileTool`:**
    *   **Where:** `packages/core/src/tools/read-file.ts`.
    *   **How:**
        *   The `ReadFileTool` constructor will accept an instance of `SessionStateService`.
        *   The `execute` method will be modified to:
            *   Call `sessionStateService.getNextVersion()` to get the new version number.
            *   Use the Node.js `crypto` module to calculate the SHA-256 hash of the file content.
            *   Change its `llmContent` return value from a plain string to the structured JSON object defined in section 4.1.

3.  **Upgrade `ReadManyFilesTool`:**
    *   **Where:** `packages/core/src/tools/read-many-files.ts`.
    *   **How:**
        *   The `ReadManyFilesTool` constructor will accept an instance of `SessionStateService`.
        *   The `execute` method will be modified to iterate through the requested paths. For each file, it will perform the same versioning and hashing logic as `ReadFileTool`.
        *   It will change its `llmContent` return value from an array of strings to an array of the structured JSON objects defined in section 4.1.

4.  **Implement `SafePatchTool`:**
    *   **Where:** Create a new file `packages/core/src/tools/safe-patch.ts`.
    *   **How:**
        *   Create a new `SafePatchTool` class extending `BaseTool`.
        *   The constructor will accept `Config` and `SessionStateService` instances.
        *   **Detailed Execution Flow & Error Handling:** The `execute` method will be structured with multiple, distinct exit points to provide clear feedback to the LLM.
            1.  **State Verification (Hash Check):**
                *   Read the live file content and calculate its SHA-256 hash.
                *   **If hashes mismatch:** Immediately fail. Return `success: false` with `message: "State Mismatch: File has changed on disk since it was last read."` and include the `latest_file_state` of the live file for immediate recovery.
            2.  **"Fix the Diff" Stage:**
                *   Take the LLM's `unified_diff` and the known-good original content (from the hash match).
                *   Programmatically find the true line numbers for each hunk by matching the context and removal lines (` ` and `-`).
                *   **If a hunk's context/removal lines cannot be found in the original content:** The diff is fundamentally flawed. Fail with `success: false` and `message: "Invalid Diff: The provided diff content does not match the file's content. The context or lines to be removed may be incorrect."`. The `latest_file_state` will be the *unchanged* original file state.
                *   If successful, generate a new, corrected `unified_diff` in memory.
            3.  **"Apply Strict Patch" Stage:**
                *   Use the `diff` library's strict `applyPatch` function on the *corrected* diff.
                *   The `applyPatch` function itself can return `false` if it fails for an unexpected reason (e.g., a bug in the library or a subtle diff format error).
                *   **If `applyPatch` fails:** This is an unexpected internal error. Fail with `success: false` and `message: "Internal Error: The corrected patch failed to apply. Please review the diff for subtle errors."`. The `latest_file_state` will be the *unchanged* original file state.
            4.  **Success:**
                *   If the patch applies successfully, write the new content to disk.
                *   Return `success: true` with `message: "Patch applied successfully."` and the `latest_file_state` containing the newly written content, hash, and version.
        *   **Dependency:** The `diff` library's `applyPatch` function **MUST** be used for the final, strict application step. The "Fix the Diff" logic will need to be implemented as a new utility function.

5.  **Update CLI Frontend for `@` Operator:**
    *   **Where:** `packages/cli/src/ui/hooks/atCommandProcessor.ts`.
    *   **How:** The `handleAtCommand` function currently calls the `read_many_files` tool and processes its string output. This function must be modified to handle the new return type. It will now receive an array of versioned JSON objects. Its responsibility is to parse this array and format the structured data (including file path, version, hash, and content) into the prompt sent to the LLM, ensuring the LLM receives the full "versioned ground truth" without needing a follow-up tool call.

6.  **Integrate with Gemini-CLI Console UI:**
    *   **Where:** Within the new `packages/core/src/tools/safe-patch.ts` file.
    *   **How:** The existing UI confirmation flow for `replace` and `write_file` can be reused seamlessly. This is handled by the `shouldConfirmExecute` method.
        *   The `SafePatchTool` will implement a `shouldConfirmExecute` method.
        *   Inside this method, it will first perform the SHA-256 hash check. If the check fails, it will return `false` to prevent the confirmation from appearing.
        *   If the hash check passes, it will read the original file content and use the `unified_diff` provided by the LLM.
        *   It will then construct and return a `ToolEditConfirmationDetails` object, just as the current tools do. The `fileDiff` property of this object will be the `unified_diff` from the LLM's parameters.
        *   The existing `gemini-cli` console logic will automatically render this object as an interactive diff for the user to approve or deny, requiring no changes to the core UI code.

7.  **Register New/Modified Tools:**
    *   **Where:** `packages/core/src/config/config.ts`, within the `createToolRegistry` method.
    *   **How:**
        *   The `ReadFileTool` and `ReadManyFilesTool` registrations will be updated to pass the `SessionStateService` instance.
        *   A new line will be added: `registerCoreTool(SafePatchTool, this, this.sessionStateService)`.
        *   The line for `registerCoreTool(EditTool, this)` will be removed to deprecate the old tool.

### 6. LLM Guidance and Tool Discovery

The `gemini-cli` model does not use a single, global "system prompt." Instead, each tool's `description` field serves as the just-in-time prompt for the LLM, defining the agent's workflow. This is the correct and established mechanism for providing LLM guidance.

*   **Action:** The `description` fields for the affected tools will be meticulously crafted to include the new workflow instructions.
*   **`read_file` description update:**
    > "Reads the content of a file and returns it along with a session-unique version number and a SHA-256 hash. This versioned data is required for safely modifying files with the `safe_patch` tool."
*   **`read_many_files` description update:**
    > "Reads the content of multiple files and returns an array of objects, where each object contains the file content along with a session-unique version number and a SHA-256 hash. This versioned data is required for safely modifying files."
*   **`safe_patch` description:**
    > "Applies a set of changes to a file using a unified diff patch. This is the preferred tool for all file modifications.
    >
    > **Usage Protocol:**
    > 1.  To use this tool, you must operate on the latest version of the file available in your context. Identify this by finding the file content with the **highest version number**.
    > 2.  If no versioned content is available, you **MUST** call `read_file` or `read_many_files` first to get it.
    > 3.  When generating the `unified_diff`, you **MUST** include at least 10 lines of unchanged context around each change hunk (equivalent to `diff -U 10`) to ensure the patch can be applied reliably.
    > 4.  You **MUST** provide the `sha256` hash that was returned with that version as the `base_content_sha256` parameter. This hash acts as a lock; the operation will fail if the file has been modified since you read it."

This approach embeds the instructions directly with the tool definition, which is the idiomatic pattern for `gemini-cli`. The LLM will always receive the latest instructions and state from the tool's output, enabling it to self-correct and follow the protocol.

### 7. Test Plan

Testing will follow the existing project convention of co-locating `*.test.ts` files with the source files, using the `vitest` framework.

1.  **`SessionStateService` Tests (`packages/core/src/services/session-state-service.test.ts`):**
    *   A new test file will be created.
    *   Test that `getNextVersion()` starts at 1 and increments correctly on subsequent calls.
    *   Test that a new instance of the service resets the counter to 0.

2.  **`ReadFileTool` Tests (`packages/core/src/tools/read-file.test.ts`):**
    *   The existing test file will be modified.
    *   Update existing tests to assert that the `llmContent` is now the structured JSON object.
    *   Add new tests to verify that the `version` number increments correctly across multiple calls to `read_file`.
    *   Add a test to verify that the returned `sha256` hash is correct for a known file content.
    *   Mocks for `fs` and `SessionStateService` will be required.

3.  **`ReadManyFilesTool` Tests (`packages/core/src/tools/read-many-files.test.ts`):**
    *   The existing test file will be modified.
    *   Update tests to assert that the `llmContent` is now an array of the structured JSON objects.
    *   Verify that version numbers increment correctly for each file read within a single call.
    *   Verify that the `sha256` hash is correct for each file.
    *   Mocks for `fs` and `SessionStateService` will be required.

4.  **`SafePatchTool` Tests (`packages/core/src/tools/safe-patch.test.ts`):**
    *   A new test file will be created to cover the multi-stage logic of the tool.
    *   **Success Case (Correct Patch):** Test that a valid, correct patch is applied successfully when the `base_content_sha256` matches. Verify the new content and the successful return object.
    *   **Success Case (Corrected Patch):** Test that a patch with an intentionally incorrect line number but correct context lines is successfully "fixed" and applied. Verify the final content is correct.
    *   **Failure Case (Hash Mismatch):** Test that the tool fails immediately if the provided hash does not match the live file's hash. Verify the file is unchanged and the specific "State Mismatch" error is returned along with the `latest_file_state`.
    *   **Failure Case (Invalid Diff Content):** Test that the tool fails during the "Fix the Diff" stage. Provide a valid hash but a `unified_diff` where the context or removal lines do not exist in the source content. Verify the file is unchanged and the specific "Invalid Diff" error message is returned.
    *   **Failure Case (Internal Patch Error):** Use `vi.spyOn` to mock the `applyPatch` function from the `diff` library and force it to return `false`. Test that the tool correctly catches this and returns the "Internal Error" message.
    *   **File Creation Case:** Test that the tool can create a new file when the original file does not exist (the hash of an empty string can be used as the base).

5.  **`atCommandProcessor` Tests (`packages/cli/src/ui/hooks/atCommandProcessor.test.ts`):**
    *   The existing test file will be modified.
    *   Mock the `read_many_files` tool to return the new structured data (an array of versioned JSON objects).
    *   Add a new test to verify that the `handleAtCommand` function correctly parses this new structure and formats it into the `processedQuery` parts sent to the LLM, ensuring all versioning information is present.