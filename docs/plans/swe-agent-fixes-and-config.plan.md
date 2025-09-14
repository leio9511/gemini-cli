# Feature Plan: SWE Agent Fixes and Configuration

**Reference Design Doc:** @docs/designs/swe-agent-fixes-and-config.md

This plan outlines the work to remediate failing tests, correctly implement the escalation tool, and make the SWE Agent's debugging strategy configurable.


## Phase 1: Remediate Failing Integration Tests

The SWE Agent's test suite is currently failing with 8 errors. To manage this, we will first isolate each failing test into its own file within a temporary directory, excluded from the test runner. This will immediately bring the build to a green state. Subsequently, each test will be fixed in its own pull request.

### Pull Request #1: Isolate Failing Tests into Individual Files [DONE] e06bd1957c38de155fbf84734aaa7784bdc9c3d1

- **PR Title:** test(swe-agent): isolate failing tests into individual files
- **Summary:** This PR isolates the 8 failing orchestration tests by moving each into its own file within a new `tests/failing` directory. The test runner is configured to ignore this directory, immediately bringing the preflight check to a green state. This creates a clean baseline for fixing each test in a dedicated pull request.
- **Verification Plan:**
  - Run `npm run preflight -w @google/gemini-cli-swe-agent-tests`.
  - Verify the command passes.
- **Planned Implementation Tasks:**
  - [ ] Task: Create a new directory: `tests/failing`.
  - [ ] Task: For each of the 8 failing tests, move it from `tests/orchestration.integration.test.ts` into a new, dedicated file inside `tests/failing`. Ensure all necessary imports and test setup are also moved.
  - [ ] Task: Update `.agents/swe_agent/vitest.config.ts` to add `exclude: ['tests/failing/**/*.ts']` to the test configuration.
  - [ ] Task: Run the preflight command to confirm it's green.

### Subsequent Pull Requests: Fix Failing Tests

After the initial PR, a series of pull requests will be created to fix each of the failing tests. Each PR will target one test file.


- **PR #2 Title:** `fix(swe-agent): fix failing test "should transition from INITIALIZING to EXECUTING_TDD and create a branch"` [DONE] 2188c699db1f68acbe1de5e2ee7f073cfbc868cd
- **PR #3 Title:** `fix(swe-agent): fix failing test "should prevent escalation when debug attempts are low"` [DONE] 60fafd66e7152f0e912c3072fb802917977e6913
- **PR #4 Title:** `fix(swe-agent): fix failing test "should provide re-planning instructions when in REPLANNING state"` [DONE] 5b07fc8574031ae9d6fa80453653507ed327b3d3
- **PR #5 Title:** `fix(swe-agent): fix failing test "should transition from CODE_REVIEW to EXECUTING_TDD when there are findings"` [DONE] 5e8fe2165f8f308910f4d0d1adf00086881bf60d
- **PR #6 Title:** `fix(swe-agent): fix failing test "should transition from EXECUTING_TDD to CODE_REVIEW after a fix is submitted"` [DONE] b77a7e93d63d83f0f5a451fea04455eed4c8cd3b
- **PR #7 Title:** `fix(swe-agent): fix failing test "should transition from PLAN_UPDATED to INITIALIZING and merge the branch"`
- **PR #8 Title:** `fix(swe-agent): fix failing test "should transition from PLAN_UPDATED to HALTED on merge conflict"`
- **PR #9 Title:** `fix(swe-agent): fix failing test "should instruct to create a safety checkpoint after a green step"`

- **Summary (template):** This PR fixes the failing test `[test name]`. It moves the test file from the `tests/failing` directory back into the main `tests` directory, re-enabling it in the test suite, and implements the necessary code changes to make it pass.
- **Verification Plan (template):**
  - Run the specific test file and verify it passes.
  - Run the full preflight to ensure no regressions.
- **Planned Implementation Tasks (template):**
  - [ ] Task: Move the test file for `[test name]` from `tests/failing` to `tests/`.
  - [ ] Task: Run the test to confirm it fails as expected.
  - [ ] Task: Implement the code changes to fix the test.
  - [ ] Task: Run the test again to verify the fix.
  - [ ] Task: Run the full preflight check.


## Phase 2: Implement Escalation Tool and Prompt

### Pull Request #10: Implement Escalation Tool and Instructional Prompt

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

### Pull Request #11: Configure Debugging Strategy Thresholds

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
