# Design Doc: Add `--config-file` Flag for Custom Project Settings

**Status:** Proposed

## 1. Summary

This document proposes the addition of a new command-line flag, `--config-file`, to the `gemini-cli`. This flag will allow users to specify a custom path to a JSON file to be used as the project-level settings, overriding the default `.gemini/settings.json` file for a single invocation.

## 2. Motivation

The primary motivation for this feature is to enable more robust and flexible multi-agent workflows. As we develop the 3-Agent Automated Development Workflow (`Plan`, `SWE`, `Code Review`), we need a way for an external orchestrator script to invoke `gemini-cli` instances with different configurations (or "personas") for each agent.

For example, the `SWE Agent` might need a configuration that enables a specific set of tools, while the `Code Review Agent` might have a different configuration with a different context file or telemetry settings.

While many settings can be overridden by individual flags, providing a dedicated settings file for each agent is a cleaner, more scalable, and more maintainable solution. It allows for the complete configuration of an agent to be captured in a single, version-controlled file.

## 3. Proposed Solution

The proposed solution involves a small, low-risk, additive change to the CLI's configuration loading mechanism.

### 3.1. Add New Command-Line Flag

A new flag will be added to the command-line parser (likely in `packages/cli/src/cli.ts` or a similar file).

*   **Flag:** `--config-file`
*   **Alias:** `--cf`
*   **Type:** `string`
*   **Description:** "Specify a custom path for the project settings JSON file. Overrides the default `.gemini/settings.json`."

**Note:** The alias `-c` was originally considered but is already in use by the `--checkpointing` flag. `--cf` is the proposed alternative.

### 3.2. Modify Configuration Loading Logic

The core change will be in `packages/cli/src/config/settings.ts`. The logic responsible for loading the project-level settings will be updated.

**Current Logic (Conceptual):**
1.  Construct the path to `.gemini/settings.json`.
2.  Load the settings from that file if it exists.

**New Logic (Conceptual):**
1.  Check if the `--config-file` flag was provided in the command-line options.
2.  **If yes:**
    *   Use the path provided by the flag as the project settings file path.
    *   Load the settings from this custom path.
3.  **If no:**
    *   Fall back to the existing behavior of loading from `.gemini/settings.json`.

This ensures the change is fully backward-compatible.

### 3.3. Configuration Precedence

This new flag will only affect the **project settings file** layer in the configuration hierarchy. It will still be overridden by environment variables and other command-line arguments, and it will still override the user and system settings files.

The updated precedence will be:

1.  Default values
2.  User settings file (`~/.gemini/settings.json`)
3.  **Project settings file** (from `--config-file` path, or `.gemini/settings.json` if not provided)
4.  System settings file
5.  Environment variables
6.  Other command-line arguments

## 4. Testing Strategy

A new unit test will be added to `packages/cli/src/config/settings.test.ts`. This test will:
1.  Create two temporary settings files (e.g., `test-settings-a.json` and `test-settings-b.json`) with distinct values for a specific setting (e.g., `"theme": "ThemeA"` and `"theme": "ThemeB"`).
2.  Invoke the configuration loader, passing the path to `test-settings-a.json` via the new `--config-file` option.
3.  Assert that the loaded configuration contains `"theme": "ThemeA"`.
4.  Invoke the configuration loader again without the flag to ensure it falls back to the default behavior.

## 5. Documentation Changes

The official CLI documentation will be updated to reflect this new feature.
*   **File:** `docs/cli/configuration.md`
*   **Change:** A new entry will be added to the "Command-Line Arguments" section detailing the `--config-file` flag, its alias, and its purpose.

This plan outlines a clear and straightforward path to implementing a valuable feature that will unlock immediate progress in testing and refining our multi-agent development workflows.
