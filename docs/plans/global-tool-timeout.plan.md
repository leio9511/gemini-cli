# Feature Plan: Global Tool Timeout

**Reference Design Doc:** @[docs/designs/global-tool-timeout.md]

This plan outlines the engineering steps required to implement a global and tool-specific timeout mechanism for all tool calls within the Gemini CLI. The work is divided into two sequential Pull Requests.

---


## Phase 1: Configuration and Tooling Infrastructure

### Pull Request #1: Add Timeout Properties to Config and BaseTool [DONE] a872a1ee92bf02558e3078bc458b1b21ba8930f2

- **PR Title:** feat(core): Add configuration for global and tool-specific timeouts
- **Summary:** This PR lays the groundwork for the timeout feature by introducing the necessary configuration properties. It adds a `toolCallTimeout` to the global `Config` and an optional `timeout` override property to the `BaseTool` class and its derivatives, but does not implement the timeout enforcement logic itself.
- **Verification Plan:**
  - All new code will be covered by unit tests.
  - We will verify that the `Config` object correctly initializes with a default `toolCallTimeout` and can accept a custom value.
  - We will verify that `BaseTool` and `DiscoveredMCPTool` can be instantiated with a `timeout` property.
- **Planned Implementation Tasks:**
  - [ ] [RED] In `packages/core/src/config/config.test.ts`, write a failing test to check for a `toolCallTimeout` property on a `Config` instance.
  - [ ] [GREEN] In `packages/core/src/config/config.ts`, add the `toolCallTimeout` property to the `ConfigParameters` interface and the `Config` class, with a default of `180000`.
  - [ ] [REFACTOR] Refactor the `Config` class for clarity if needed.
  - [ ] [RED] In `packages/core/src/tools/tools.test.ts`, write a failing test for a `BaseTool` subclass that checks for a `timeout` property.
  - [ ] [GREEN] In `packages/core/src/tools/tools.ts`, add an optional `timeout?: number` property to the `BaseTool` class constructor.
  - [ ] [REFACTOR] Refactor the `BaseTool` class.
  - [ ] [RED] In `packages/core/src/tools/mcp-tool.test.ts`, write a failing test to ensure the `DiscoveredMCPTool` constructor correctly accepts and stores a `timeout` value.
  - [ ] [GREEN] In `packages/core/src/tools/mcp-tool.ts`, update the `DiscoveredMCPTool` constructor to accept the `timeout` property and pass it to the `BaseTool` constructor.
  - [ ] [REFACTOR] Refactor the `DiscoveredMCPTool` class.

---


## Phase 2: Timeout Enforcement Logic

### Pull Request #2: Implement Global Timeout Enforcement

- **PR Title:** feat(core): Implement global timeout enforcement for tool calls
- **Summary:** This PR introduces the core timeout logic. It modifies `NonInteractiveToolExecutor` to abort tool calls that exceed the global `toolCallTimeout` and throws a `ToolTimeoutError`.
- **Verification Plan:**
  - All new logic will be covered by unit tests in `packages/core/src/core/nonInteractiveToolExecutor.test.ts`.
  - Test that a tool call times out using the global default timeout.
  - Test that a tool call finishing within the time limit completes successfully.
- **Planned Implementation Tasks:**
  - [ ] [RED] In `packages/core/src/core/nonInteractiveToolExecutor.test.ts`, write a failing test that executes a mock tool designed to hang longer than the global timeout. Assert that the `execute` method throws a `ToolTimeoutError`.
  - [ ] [GREEN] In `packages/core/src/core/nonInteractiveToolExecutor.ts`, define a `ToolTimeoutError` class. Modify the `execute` method to wrap the tool call in a `Promise.race` against a `setTimeout` that rejects with the new error, using the global `toolCallTimeout` from the config.
  - [ ] [REFACTOR] Clean up the `execute` method and error handling logic.
  - [ ] [RED] Write a test for the success case. The mock tool should resolve successfully before the timeout is reached. Assert that the `execute` method returns the correct value and does not throw an error.
  - [ ] [GREEN] Ensure the existing `Promise.race` logic correctly handles the case where the tool's promise resolves first.
  - [ ] [REFACTOR] Final review of the `NonInteractiveToolExecutor` for clarity and correctness.

### Pull Request #3: Add Tool-Specific Timeout Override

- **PR Title:** feat(core): Add support for tool-specific timeout overrides
- **Summary:** This PR builds on the global timeout feature by allowing individual tools to specify their own timeout duration, which will override the global setting.
- **Verification Plan:**
  - Unit tests will be added to `packages/core/src/core/nonInteractiveToolExecutor.test.ts`.
  - Test that a tool call correctly times out using its own, shorter, tool-specific timeout.
- **Planned Implementation Tasks:**
  - [ ] [RED] In `packages/core/src/core/nonInteractiveToolExecutor.test.ts`, write a new failing test. This test will use a mock tool that has a specific `timeout` property set, which is shorter than the global timeout. Assert that the executor respects the tool-specific timeout.
  - [ ] [GREEN] In `packages/core/src/core/nonInteractiveToolExecutor.ts`, update the `execute` method to check for a `tool.timeout` property and use it in the `Promise.race` instead of the global timeout if it's available.
  - [ ] [REFACTOR] Refine the timeout value selection logic for clarity.

### Pull Request #4: Add AbortSignal on Timeout

- **PR Title:** feat(core): Trigger AbortSignal on tool timeout
- **Summary:** This PR enhances the timeout mechanism by integrating it with an `AbortSignal`. When a tool call times out, the `AbortSignal` passed to the tool will be aborted, allowing the tool to perform cleanup or stop its work gracefully.
- **Verification Plan:**
  - Unit tests will be added to `packages/core/src/core/nonInteractiveToolExecutor.test.ts`.
  - Test that the `AbortSignal` passed to the tool is correctly triggered on timeout.
- **Planned Implementation Tasks:**
  - [ ] [RED] In `packages/core/src/core/nonInteractiveToolExecutor.test.ts`, write a test to verify that the `AbortSignal` passed to the tool is correctly triggered on timeout. The mock tool should check the `aborted` status of the signal it receives.
  - [ ] [GREEN] In `packages/core/src/core/nonInteractiveToolExecutor.ts`, create an `AbortController` within the `execute` method. Pass its signal to the tool's `execute` method and call `controller.abort()` when the timeout is triggered.
  - [ ] [REFACTOR] Ensure the `AbortController` and signal handling are implemented cleanly.
