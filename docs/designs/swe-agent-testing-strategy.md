# Design: SWE Agent Testing Strategy

## 1. Overview & Philosophy

A robust testing strategy is critical for building a reliable and maintainable autonomous agent. The goal is not to choose a single "best" type of test, but to use a multi-layered approach where each layer addresses a different level of granularity and purpose. This document outlines the official testing strategy for the SWE Agent, structured as a classic testing pyramid.

This strategy moves away from brittle, implementation-specific unit tests (e.g., shell scripts testing the internal logic of other shell scripts) and toward a more stable and valuable hierarchy of tests.

## 2. The Testing Pyramid

Our strategy is composed of three distinct tiers.

### Tier 1: Unit Tests (The Foundation)

Unit tests are the foundation of the pyramid. They are fast, focused, and precisely locate failures in isolated logic.

- **Purpose:** To verify the correctness of individual, stateless, deterministic functions (or "units") of code.
- **What to Test:**
  - Pure helper functions (e.g., a function that sanitizes a PR title into a git-friendly branch name).
  - Complex data transformation or parsing logic.
  - Any piece of code that can be tested without dependencies on the file system, external processes (`git`, `npm`), or state files.
- **What NOT to Test:**
  - The orchestration logic that spans multiple files and tools.
  - Functions that interact directly with the file system or child processes. Mocking these dependencies for a unit test is often complex and leads to brittle tests that are tightly coupled to the implementation.
- **Strategy:** We will be highly selective when writing unit tests. They should only be created for isolated, pure logic where the benefit of rapid, precise feedback is high. We will actively avoid writing unit tests that require complex mocking of the agent's environment.

### Tier 2: Integration Tests (The Middle Layer)

This is the most critical layer for the SWE Agent's reliability. Integration tests verify that the major components of the system work together correctly according to their defined "contracts."

- **Purpose:** To validate the agent's core state machine and the interactions between its components, primarily the `swe-agent` and the `Orchestrator Tooling` (`get_task`, `submit_work`).
- **What to Test:**
  - **State Transitions:** Does calling `submit_work` in the `EXECUTING_TDD` state correctly transition the system to `DEBUGGING` when a test fails?
  - **Tool Contracts:** Does the `get_task` tool provide the correct output based on the contents of `ORCHESTRATION_STATE.json`?
  - **File System I/O:** Are the `ACTIVE_PR.json` and `ORCHESTRATION_STATE.json` files read and written correctly during state transitions?
- **Implementation:** This is embodied by the `orchestration.integration.test.ts` test suite. It simulates the agent's actions within a controlled environment and asserts the integrity of the state machine's transitions.
- **Debugging:** While a failing integration test points to a problem "somewhere in the interaction," our test is designed around small, discrete state transitions. This makes debugging manageable. For example, if the "`EXECUTING_TDD` -> `DEBUGGING`" transition fails, we know the bug is in the part of `submit_work.sh` that handles unexpected test failures, not in unrelated logic like code review or branch creation.

### Tier 3: Manual / End-to-End (E2E) Tests (The Peak)

This is the final and ultimate validation, answering the fundamental question: "Does the agent actually accomplish the software engineering task from start to finish?"

- **Purpose:** To simulate a real-world scenario, verifying the complete workflow from the user's perspective. This is our final confidence check.
- **How it Works:**
  1.  **Define a Realistic Task:** Create a master plan file (e.g., `docs/plans/test-feature.plan.md`) with a simple but non-trivial feature request.
  2.  **Initiate the Agent:** Run the `gemini` CLI to start the SWE agent workflow on the defined plan.
  3.  **Observe:** Let the agent run autonomously without intervention.
  4.  **Verify the Outcome:** Check the final state of the repository. Was the branch created, coded, committed, and merged correctly? Does the final code pass all `preflight` checks and function as intended?
- **Role:** This is not for catching bugs in helper functions or incorrect state transitions; that is the job of the lower tiers. This is for catching high-level logical failures and ensuring the final product aligns with human expectations. This is the test a human runs to say, "Yes, it works."

## 3. Summary: A Balanced Strategy

Our testing strategy is a balanced pyramid:

1.  **(Foundation) A few, high-value Unit Tests:** For pure, isolated helper functions.
2.  **(Middle) One Comprehensive Integration Test:** The `orchestration.integration.test.ts` file is the core of our automated testing, verifying the state machine and tool contracts. This is our primary investment.
3.  **(Peak) A Repeatable Manual E2E Test Plan:** A documented process for running the agent on a sample task to verify the end-to-end success of the workflow, serving as our final quality gate.
