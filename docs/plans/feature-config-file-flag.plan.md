# Feature Plan: --config-file Flag Support

**Author:** plan-agent@google.com
**Date:** 2025-08-07
**Status:** Ready for Development

---

### **1. Abstract**

This document outlines the plan to introduce a new command-line flag, `--config-file` (alias `--cf`), to the `gemini-cli`. This feature will allow users to specify a custom path for a project-level settings file, overriding the default `.gemini/settings.json`. This enhancement is primarily motivated by the need to support flexible configurations for multi-agent workflows, where different agents require different settings during their execution.

### **2. Agile Implementation Plan**

The implementation for this feature is small and self-contained. It can be delivered in a single Pull Request.

---

#### **Phase 1: Core Feature Implementation**

**Pull Request #1: feat: Add --config-file flag for custom project settings**
- **Summary:** This PR will introduce the `--config-file` (alias `--cf`) flag, allowing the CLI to load a project settings file from a specified path instead of the default location.
- **Verification Plan:**
    - Run the new unit test in `packages/cli/src/config/settings.test.ts` to confirm the flag works as expected and does not break existing behavior. The command is `npm test -w @google/gemini-cli -- packages/cli/src/config/settings.test.ts`.
    - Manually run `gemini-cli --cf /path/to/custom.json` and verify the settings from the custom file are applied.

**Implementation Tasks:**

**Task 1: Implement and test the `--config-file` flag logic**
*   **TDD Steps:**
    1.  **Red:** Write a new unit test in `packages/cli/src/config/settings.test.ts`. This test will simulate passing the `--config-file` flag and assert that the settings from the specified file are loaded. It will fail because neither the flag definition nor the loading logic exists yet.
    2.  **Green:** Implement the minimal code required to make the test pass. This involves two parts done together:
        *   Add the `--config-file` flag (with alias `--cf`) to the CLI's command-line argument parser.
        *   Modify the settings loading logic in `packages/cli/src/config/settings.ts` to check for the new flag and use its value to load the project settings.
    3.  **Refactor (Optional):** Clean up the new code to ensure it's clear and efficient.

**Task 2: Update user documentation**
*   **TDD Steps:**
    1.  **Red:** This is a documentation change and does not have a direct test. The "failing test" is the absence of documentation for the new feature.
    2.  **Green:** In `docs/cli/configuration.md`, add a new entry in the "Command-Line Arguments" section detailing the `--config-file` flag, its alias `--cf`, and its purpose.
