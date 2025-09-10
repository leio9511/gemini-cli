### **Design Doc: Agent Tool Interaction Improvements**

**Status:** PROPOSED
**Author:** gemini-agent
**Date:** September 8, 2025

---

### 1. Abstract

This document proposes a series of improvements to the interaction between the LLM agent and the file system tools (`safe_patch`, `write_file`). The proposed changes aim to make the agent more efficient, reliable, and intelligent by addressing three key issues: redundant data in tool failure responses, inefficient file handling workflows, and a lack of mandatory post-action verification. The solutions focus on enhancing tool feedback and refining the agent's operational instructions to establish a more robust and efficient workflow.

### 2. Problem Statements & Proposed Solutions

#### 2.1. Inefficient Failure Feedback from `safe_patch`

- **Problem:** When `safe_patch` fails because of a malformed or inapplicable `unified_diff` (but the file hash is correct), its error response includes the full, unchanged content of the file. This is redundant, as the agent already has this content in its context, leading to unnecessary token consumption and context pollution.
- **Proposed Solution:**
  1.  **Differentiate Failure Modes:** The `safe_patch` tool will be designed to distinguish between two failure types:
      - **State Mismatch Failure:** If the `base_content_sha256` is incorrect, the tool will return the new file content and hash, as this is essential information for the agent to recover.
      - **Patch Application Failure:** If the hash is correct but the patch cannot be applied, the tool will return a detailed error message **without** the file content.
  2.  **Enhance Error Details:** The error message for a patch application failure will be improved to include the specific hunk number and the first line of context that failed to match. This provides the agent with precise, actionable feedback to debug and correct the diff.

#### 2.2. Redundant "Read-Before-Write" Workflow

- **Problem:** The agent currently follows a rigid "read-before-write" pattern, calling `read_file` even when the most recent version of the file is already available in the chat history. This adds unnecessary latency and token usage to the interaction. The hash check in `safe_patch` already provides a robust guard against modifying stale files.
- **Proposed Solution:**
  1.  **Modify Tool Descriptions:** The descriptions for `safe_patch` and `write_file` will be updated to guide the LLM towards a more efficient workflow.
  2.  **New Instructions:** The new instructions will direct the LLM to first search its context (the chat history) for the most recent version of a file. It should use the content and `sha256` from the history to perform modifications. The LLM should only call `read_file` if the file is not present in the context or if it has reason to believe the context is stale.

#### 2.3. Lack of Explicit Post-Modification Verification

- **Problem:** After a successful file modification, the agent does not consistently or explicitly verify that its changes are correct and fully align with the user's request. While the tool's successful output (containing the new file state) is available in the context, there is no mandate for the agent to analyze it. This can lead to subtle errors being missed until later in the development process.
- **Proposed Solution:**
  1.  **Introduce a Verification Mandate in Tooling:** The descriptions for `safe_patch` and `write_file` will be updated to include a requirement for post-action verification.
  2.  **New Instructions:** The new instructions will state that after every successful file modification, the agent's next step is to analyze the `latest_file_state` returned by the tool. It must confirm that the changes are correct and then report this verification to the user. This makes verification a required and explicit part of the agent's workflow.
  3.  **(Future Work):** This explicit manual verification sets the stage for a future enhancement where the agent also runs automated checks like linters or tests (`npm run preflight`) as a secondary, more robust verification layer.

---

### 3. Implementation Plan

This plan details the implementation steps for the three approved design improvements.

#### 3.1. Improvement: Efficient Failure Feedback from `safe_patch`

- **Current Behavior:**
  - **State Mismatch Failure:** Correctly returns `success: false`, a "State Mismatch" message, and the `latest_file_state`. This behavior will not be changed.
  - **Patch Application Failure (`InvalidDiffError`):** Returns `success: false`, an "Invalid Diff" message, and redundantly includes the `latest_file_state`. This is the behavior to be changed.
- **Expected Behavior:**
  - **Patch Application Failure (`InvalidDiffError`):** Will return `success: false` and a detailed error message, but **will NOT** include the `latest_file_state`.
  - **Error Message Enhancement:** The error message will be more specific, indicating the hunk number that failed.
- **Where to Make the Changes:**
  1.  **File:** `packages/core/src/utils/patchUtils.ts`
      - **Function:** `applyFuzzyPatch`
      - **Change:** Modify the function to track the hunk index and include it in the `InvalidDiffError` message (e.g., "Hunk #1 Content Mismatch...").
  2.  **File:** `packages/core/src/tools/safe-patch.ts`
      - **Function:** `execute`
      - **Change:** In the `catch` block for `InvalidDiffError`, change the logic to return a simple error object directly, removing the call to `_createFailureResult`.
- **How to Verify:**
  - **Unit Tests:** In `packages/core/src/tools/safe-patch.test.ts`, create a test where `applyFuzzyPatch` is mocked to throw an `InvalidDiffError`. Assert that the returned `llmContent` **does not** have the `latest_file_state` property and that the error message contains a hunk number.

#### 3.2. Improvement: Redundant "Read-Before-Write" Workflow

- **Current Behavior:** The tool descriptions for `safe_patch` and `write_file` imply that `read_file` should always be called before a modification.
- **Expected Behavior:** The tool descriptions will guide the LLM to prioritize using file content already present in the conversation history, falling back to `read_file` only when necessary.
- **Where to Make the Changes:**
  1.  **File:** `packages/core/src/tools/safe-patch.ts`
      - **Location:** The description string in the `constructor`.
      - **Description Change (Summary):** Change "If no versioned content is available, you MUST call `read_file`..." to "To get the file's version and hash, first check the conversation history... If the file is not in the history, you MUST call `read_file`...".
  2.  **File:** `packages/core/src/tools/write-file.ts`
      - **Location:** The description string in the `constructor`.
      - **Description Change (Summary):** Change "...You MUST first have the latest versioned content of the file (from read_file...)" to "...first check the conversation history for the latest version of the file... If it's not available, call `read_file` first."
- **How to Verify:**
  - **Manual Verification:** This is a prompt-based change. Verification will involve executing test cases to observe if the agent correctly avoids the redundant `read_file` call when file content is already in its context.

#### 3.3. Improvement: Lack of Explicit Post-Modification Verification

- **Current Behavior:** The tool descriptions do not mention any requirement for the agent to verify its own work after a successful operation.
- **Expected Behavior:** The tool descriptions will explicitly state that the agent is required to verify the result of the file modification as its next step.
- **Where to Make the Changes:**
  1.  **File:** `packages/core/src/tools/safe-patch.ts`
      - **Location:** The description string in the `constructor`.
      - **Description Change:** Add a new point to the **Usage Protocol**: "6. **Verification:** After the tool succeeds, you **MUST** review the `latest_file_state` in the response to confirm that your changes were applied correctly. Report on the outcome of this verification."
  2.  **File:** `packages/core/src/tools/write-file.ts`
      - **Location:** The description string in the `constructor`.
      - **Description Change:** Add a new point to the **Usage Protocol**: "4. **Verification:** After the tool succeeds, you **MUST** review the `latest_file_state` in the response to confirm that your changes were applied correctly. Report on the outcome of this verification."
- **How to Verify:**
  - **Manual Verification:** This is a prompt-based change. We will need to run manual test cases to confirm that the agent consistently performs and reports on a verification step after every successful `safe_patch` or `write_file` call.
