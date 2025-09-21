# Design Doc: Global Tool Timeout

**Status:** PROPOSED
**Author:** gemini-agent
**Date:** September 20, 2025

---

### 1. Abstract

This document proposes the implementation of a global timeout mechanism for all tool calls within the Gemini CLI. This feature will enhance the robustness and predictability of the agent by preventing tool executions from hanging indefinitely. The proposed solution includes a default global timeout that can be configured, as well as the ability for individual tools to specify their own, overriding timeout values.

### 2. Problem Statement

Currently, the Gemini CLI lacks a consistent, overarching timeout strategy for tool calls. While some tools that perform network requests (e.g., `web_fetch`, MCP tools) have their own internal timeout mechanisms, there is no global default. This leads to several problems:

*   **Inconsistent Behavior:** Tools without a built-in timeout can hang indefinitely, leading to a frustrating user experience and potentially stalling automated workflows.
*   **Lack of Control:** Users and developers cannot easily configure a universal timeout behavior for all tools.
*   **Maintenance Overhead:** Each new tool that performs a long-running operation requires its own bespoke timeout implementation, leading to duplicated effort and potential inconsistencies.

A centralized and configurable timeout mechanism is needed to ensure that all tool calls will either complete or fail within a predictable timeframe.

### 3. Proposed Solution

The proposed solution involves a three-part implementation that introduces a global timeout, allows for tool-specific overrides, and integrates this logic into the core tool execution workflow.

#### 3.1. Add Global Timeout to `Config`

A new optional property, `toolCallTimeout`, will be added to the `ConfigParameters` interface and the `Config` class located in `packages/core/src/config/config.ts`.

*   **Property:** `toolCallTimeout`
*   **Type:** `number` (milliseconds)
*   **Default Value:** `180000` (180 seconds)
*   **Description:** This value will serve as the default timeout for any tool call that does not specify its own timeout.

#### 3.2. Add Override Capability to `BaseTool`

To allow individual tools to define their own execution time limits, an optional `timeout` property will be added to the `BaseTool` class in `packages/core/src/tools/tools.ts`.

*   **Property:** `timeout`
*   **Type:** `number` (milliseconds)
*   **Description:** When this property is set on a tool, it will override the global `toolCallTimeout`. This is useful for tools that are known to take longer (e.g., complex shell commands) or that should fail faster (e.g., quick network pings).

The `DiscoveredMCPTool` will be updated to accept this timeout value and use it, ensuring that MCP-based tools integrate seamlessly into this new system.

#### 3.3. Implement Timeout Logic in `NonInteractiveToolExecutor`

The core of the enforcement logic will reside in the `NonInteractiveToolExecutor` (`packages/core/src/core/nonInteractiveToolExecutor.ts`). The `execute` method will be modified to implement the timeout.

The new execution flow will be as follows:

1.  When a tool is invoked, the executor will determine the timeout value by checking for the tool's own `timeout` property first.
2.  If the tool-specific `timeout` is not present, the executor will use the global `config.getToolCallTimeout()` as the fallback.
3.  The tool's `execute` method will be invoked within a `Promise.race`. It will race against a `setTimeout` promise that rejects with a `ToolTimeoutError` when the time limit is exceeded.
4.  If the tool execution promise finishes first, the result is returned as normal.
5.  If the timeout promise finishes first, the tool's execution is aborted via an `AbortSignal`, and the `ToolTimeoutError` is thrown, clearly indicating that the tool call timed out.

### 4. Verification Plan

The implementation will be verified through a series of unit tests to ensure the timeout logic is working correctly under all conditions.

1.  **Test Global Timeout:**
    *   **Scenario:** Execute a mock tool that takes longer than the global `toolCallTimeout` and does not have a specific timeout override.
    *   **Assertion:** Verify that the execution is aborted and a `ToolTimeoutError` is thrown.

2.  **Test Tool-Specific Timeout Override:**
    *   **Scenario:** Execute a mock tool that has its own `timeout` property set to a value shorter than the global timeout. The tool's execution time should be longer than its specific timeout but shorter than the global one.
    *   **Assertion:** Verify that the tool-specific timeout is respected and a `ToolTimeoutError` is thrown.

3.  **Test No Timeout:**
    *   **Scenario:** Execute a mock tool that completes well within the timeout period.
    *   **Assertion:** Verify that the tool completes successfully and returns the expected result without any timeout errors.
