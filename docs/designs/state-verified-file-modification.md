## **Design Proposal: A Robust, State-Verified File Modification Toolchain**

**Status:** Proposal
**Author:** lychen@google.com
**Date:** August 2, 2025

### 1. Abstract

This document proposes a significant upgrade to the file modification capabilities of the `gemini-cli` agent. The current `replace` tool, while simple, is prone to failure in multi-turn interactions, creating inefficient and error-prone workflows. We propose replacing it with a new, state-aware toolchain centered around a `safe_patch` tool. This new system will use an in-memory version counter and cryptographic hashing for state verification, and the unified diff format for modification payloads. This design will dramatically increase the reliability and efficiency of the agent, enable complex multi-part edits in a single operation, and provide clearer, more actionable feedback to the LLM, thereby minimizing context pollution and speeding up recovery from errors.

### 2. Background & Problem Statement

In practice, the `replace` tool is highly likely to fail during interactive sessions that involve multiple modifications to the same file. This stems from fundamental limitations in its design when used in a conversational, stateful context.

*   **The Core Problem: State Synchronization Failure**
    The agent's context (its memory of a file's content, derived from chat history) can easily become stale relative to the ground truth on the file system. The `replace` tool's strict `old_string` requirement, intended as a safety measure, makes it brittle; if the LLM references a stale version of the file from its history, the `old_string` will not be found, causing the tool to fail. This forces a manual, multi-step recovery process (re-reading the file, then re-attempting the change).

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

#### Non-Goals

*   This design does not introduce any persistent state to the user's project (e.g., no `.gemini_version` file).
*   It does not change the fundamental single-threaded, turn-based nature of the agent's interaction model.

### 4. Proposed Design

We will implement a new, state-aware toolchain by upgrading `read_file` and replacing `replace` with a new `safe_patch` tool. The guiding principle is: **Tools perform computation and state verification; the LLM performs reasoning and state carrying.**

#### 4.1. Component 1: Upgraded `read_file` Tool

The `read_file` tool will be enhanced to become the primary source of versioned ground truth for the current session.

*   **Versioning:** A session-scoped, in-memory counter will be maintained within the `gemini-cli` instance. This counter will start at 0 each time `gemini-cli` is launched and will increment for each file-read or file-write operation.
*   **Logic:** When called, `read_file` will:
    1.  Read the target file's content.
    2.  Calculate a SHA-256 hash of the content.
    3.  Increment and retrieve the current session's version number.
*   **Return Signature:** The tool will return a structured JSON object.
    ```json
    {
      "file_path": "/path/to/file.py",
      "version": 1,
      "sha256": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      "content": "..."
    }
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

### 6. LLM Guidance and Tool Discovery

The `gemini-cli` model does not use a single, global "system prompt." Instead, each tool's `description` field serves as the just-in-time prompt for the LLM. This is the correct and established mechanism for providing LLM guidance. The agent's workflow is therefore defined by the instructions embedded in the tools it uses.

*   **Action:** The `description` fields for `read_file` and `safe_patch` will be meticulously crafted to include the new workflow instructions.
*   **`read_file` description update:**
    > "Reads the content of a file and returns it along with a version number and a SHA-256 hash. This versioned data is required for safely modifying files with the `safe_patch` tool."
*   **`safe_patch` description:**
    > "Applies a set of changes to a file using a unified diff patch. This is the preferred tool for all file modifications.
    >
    > **Usage Protocol:**
    > 1.  To use this tool, you must operate on the latest version of the file available in your context. Identify this by finding the file content with the **highest version number**.
    > 2.  If no versioned content is available, you **MUST** call `read_file` first to get it.
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

3.  **`SafePatchTool` Tests (`packages/core/src/tools/safe-patch.test.ts`):**
    *   A new test file will be created to cover the multi-stage logic of the tool.
    *   **Success Case (Correct Patch):** Test that a valid, correct patch is applied successfully when the `base_content_sha256` matches. Verify the new content and the successful return object.
    *   **Success Case (Corrected Patch):** Test that a patch with an intentionally incorrect line number but correct context lines is successfully "fixed" and applied. Verify the final content is correct.
    *   **Failure Case (Hash Mismatch):** Test that the tool fails immediately if the provided hash does not match the live file's hash. Verify the file is unchanged and the specific "State Mismatch" error is returned along with the `latest_file_state`.
    *   **Failure Case (Invalid Diff Content):** Test that the tool fails during the "Fix the Diff" stage. Provide a valid hash but a `unified_diff` where the context or removal lines do not exist in the source content. Verify the file is unchanged and the specific "Invalid Diff" error message is returned.
    *   **Failure Case (Internal Patch Error):** Use `vi.spyOn` to mock the `applyPatch` function from the `diff` library and force it to return `false`. Test that the tool correctly catches this and returns the "Internal Error" message.
    *   **File Creation Case:** Test that the tool can create a new file when the original file does not exist (the hash of an empty string can be used as the base).

### 8. Open Questions

*   **Error Handling for Patches:** How should the tool handle a syntactically incorrect diff from the LLM? The initial implementation should fail with a clear error message in the `message` field of the response. Future iterations could provide more specific feedback on the nature of the malformed patch.

### 8. Open Questions

*   **Error Handling for Patches:** How should the tool handle a syntactically incorrect diff from the LLM? The initial implementation should fail with a clear error message in the `message` field of the response. Future iterations could provide more specific feedback on the nature of the malformed patch.