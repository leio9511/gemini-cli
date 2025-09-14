# Feature Plan: SWE Agent Fixes and Configuration

**Reference Design Doc:** @docs/designs/swe-agent-fixes-and-config.md

This plan outlines the work to remediate failing tests, correctly implement the escalation tool, and make the SWE Agent's debugging strategy configurable.


## Phase 1: Remediate Failing Integration Tests

### Pull Request #1: Fix SWE Agent Preflight to Green State

- **PR Title:** fix(swe-agent): get SWE Agent preflight to a green state
- **Summary:** The SWE Agent's test suite is currently failing. This PR focuses on running the preflight, identifying the root causes of the failures, and implementing the necessary fixes to get all tests to pass. This will establish a stable, green baseline for future development, allowing subsequent changes to be validated against a known-good state.
- **Verification Plan:**
  - Run the SWE Agent's preflight command from the project root: `npm run preflight -w @google/gemini-cli-swe-agent-tests`.
  - Verify that the command runs successfully and all tests pass.
- **Planned Implementation Tasks:**
  - [ ] Task: Run `npm run preflight -w @google/gemini-cli-swe-agent-tests` and observe the initial failing state.
  - [ ] Task: Analyze the test failures and determine the root cause.
  - [ ] Task: Implement the necessary mocks, assertion updates, or other code changes to fix the failing tests.
  - [ ] Task: Re-run the preflight command to verify that all tests now pass.

## Phase 2: Implement Escalation Tool and Prompt

### Pull Request #2: Implement Escalation Tool and Instructional Prompt

- **PR Title:** feat(swe-agent): implement escalation tool and instructional prompt
- **Summary:** This PR aligns the `escalate_for_external_help` tool with its design. The script is updated to accept a markdown report and exit with a specific halt code (10). The `get_task` script is also updated to provide the agent with a clear instructional prompt on *how* and *when* to use the escalation tool.
- **Verification Plan:**
  - A new integration test, `should provide escalation instructions after enough failed debug attempts`, will be added to verify the new prompt from `get_task.sh`.
  - The existing test, `should escalate when requested after enough debug attempts`, will be updated to pass a markdown report and verify that the script prints the report and exits with code 10.
- **Planned Implementation Tasks:**
  - [ ] Task: Modify `escalate_for_external_help.sh` to require a command-line argument (`$1`).
  - [ ] Task: Modify `escalate_for_external_help.sh` to print the received argument to standard output.
  - [ ] Task: Modify `escalate_for_external_help.sh` to exit with a status code of `10`.
  - [ ] Task: Modify `get_task.sh` to include the new tier of debugging guidance, instructing the agent to generate a report and call `escalate_for_external_help`.
  - [ ] Task: Add a new test case to `orchestration.integration.test.ts` named `should provide escalation instructions after enough failed debug attempts`.
  - [ ] Task: Update the test case `should escalate when requested after enough debug attempts` to pass a report and assert the new script behavior (stdout and exit code).

## Phase 3: Make Debugging Strategy Configurable

### Pull Request #3: Configure Debugging Strategy Thresholds

- **PR Title:** feat(swe-agent): make debugging strategy configurable
- **Summary:** This PR decouples the debugging strategy from the agent's scripts by introducing a `swe_agent_config.json` file. The `get_task`, `request_scope_reduction`, and `escalate_for_external_help` scripts are updated to read their thresholds from this new configuration file.
- **Verification Plan:**
  - The existing integration tests for recovery tool locking (`should prevent recovery tools from being used too early`, `should prevent escalation when debug attempts are low`) will be updated to write a temporary config file with a low threshold, verifying the scripts read the config correctly.
  - The tests for unlocking the tools (`should transition to REPLANNING after enough failed debug attempts`, `should escalate when requested after enough debug attempts`) will be updated to write a temporary config with a high threshold.
- **Planned Implementation Tasks:**
  - [ ] Task: Create the new configuration file at `.agents/swe_agent/swe_agent_config.json`.
  - [ ] Task: Modify `get_task.sh` to read `hypothesize_max_attempts` and `instrumentation_max_attempts` from the config file to determine its guidance.
  - [ ] Task: Modify `request_scope_reduction.sh` to read `unlock_scope_reduction_at` from the config file to determine if it is locked.
  - [ ] Task: Modify `escalate_for_external_help.sh` to read `unlock_escalation_at` from the config file to determine if it is locked.
  - [ ] Task: Update the setup for relevant integration tests to write a temporary `swe_agent_config.json` in the test directory to control the script behavior for the test case.
