# Design Doc: The Tool-Gated SWE Agent Workflow

## 1. Overview & Core Philosophy

This document outlines a reliable, tool-driven workflow for an autonomous Software Engineering (SWE) Agent. The core philosophy is a shift from "Prompt Engineering" to "Tool Engineering."

Instead of relying on a complex, monolithic prompt that describes an entire multi-phase workflow (which is prone to "runaway execution" where the LLM agent takes unreliable shortcuts), this design uses a stateful **Orchestrator Tool** to manage a simple, stateless **SWE Agent**.

This design is a concrete implementation of the **Statistical Reliability Model**. It directly addresses the problem of statistical 'drift' in LLM agents by focusing on the primary strategy of **Reducing Scope**. The workflow is architected around frequent, verifiable checkpoints, ensuring that the agent performs a minimal number of steps before its work is validated by a deterministic tool. This prevents the accumulation of errors and makes the agent's behavior reliable and predictable.

The agent's behavior is constrained by a core principle: **make one attempt, then report.** The agent is architecturally prevented from iterating on a task. It makes its best single attempt, reports the verbatim outcome, and waits for the Orchestrator logic to analyze the result and provide the next instruction. This loop is the fundamental safety mechanism that prevents context pollution and runaway execution.

## 2. Components & Responsibilities

The system consists of three primary components, with a clear separation of responsibilities.

1.  **The SWE Agent (Responsible for Reasoning):**
    - A stateless executor responsible for reasoning, analysis, and handling unstructured data.
    - Its primary duties include analyzing code, implementing features, and interpreting natural language documents like the `Active_Plan.md`.
    - It is responsible for non-deterministic tasks that require intelligence.
    - Its core behavior is governed by the "one-shot" principle, enforced through a multi-layered instruction set.

2.  **The Orchestration Logic (Embedded in Tools):**
    - There is no persistent "Orchestrator" process. The orchestration logic is stateless and embedded within the implementations of the core tools (`get_task`, `submit_work`).
    - This logic is responsible for all deterministic state management.
    - By embedding orchestration logic within the tools, we deliberately avoid creating a higher-level 'Orchestrator Agent.' A separate agent for orchestration would introduce the same risk of statistical drift we are trying to prevent. Instead, state transitions are managed by simple, deterministic code, making the entire workflow more robust and testable.

3.  **The State Files (The "External Memory"):**
    - **`ACTIVE_PR.json`**: Contains the engineering plan (the list of TDD tasks). This is the source of truth for the work to be done.
    - **`ORCHESTRATION_STATE.json`**: Tracks the live operational state of the workflow (e.g., `EXECUTING_TDD`, `DEBUGGING`, `debug_attempt_counter`).
    ```jsonc
    // Sample ORCHESTRATION_STATE.json schema
    {
      "status": "INITIALIZING | CREATING_BRANCH | EXECUTING_TDD | DEBUGGING | REPLANNING | CODE_REVIEW | AWAITING_FINALIZATION | FINALIZE_COMPLETE | PLAN_UPDATED | MERGING_BRANCH | HALTED",
      "debug_attempt_counter": "number (optional)",
      "last_commit_hash": "string (optional)",
      "current_pr_branch": "string (optional)",
      "last_error": "string (optional)"
    }
    ```
    
The use of structured `.json` files for state management is a deliberate design choice. It allows the deterministic, stateless **Orchestration Logic** embedded in the tools to reliably parse and update the workflow's state. This cleanly separates responsibilities: the **SWE Agent** handles the complex, one-time task of converting the unstructured markdown plan into a structured JSON object, and the orchestration tools manage it from there. This avoids the risks of having logic parse natural language for state.

## 3. The Core Tools and Interaction Loop

The workflow is driven by two primary tools that manage the agent's state and goals.

### The `get_task` Tool: The State-Aware "Mission Briefer"

This tool is the agent's entry point for discovering its current goal. Its response is not static; it changes based on the `state` in `ORCHESTRATION_STATE.json`.

- **In Normal Mode (`EXECUTING_TDD`):** It provides a clear, forward-looking goal: "Your goal is to complete the next TDD step: `[...]`". It presents the standard toolkit for coding (`read_file`, `safe_patch`, `submit_work`).

- **In Debug Mode (`DEBUGGING`):** It provides a completely different "mission briefing":
  - **New Goal:** "Your previous submission failed. Your new primary goal is to fix the bug."
  - **Full Context:** It provides the verbatim error log from the failed `submit_work` call.
  - **Dynamic Guidance:** It provides a set of strategic recommendations that change based on the `debug_attempt_counter` (see Debugging Protocol).

### The `submit_work` Tool: The "Verification Gateway"

This tool is the single, exclusive gateway for all code verification. The agent is **forbidden** from using `run_shell_command` to execute tests.

- **Agent Provides Intent:** The agent must provide its `expectation` for the test outcome (`PASS` or `FAIL`).
- **Handles Ambiguity:** For a `FAIL` expectation (a `RED` step), the tool will **always** return a `NEEDS_ANALYSIS` status, forcing the agent to analyze the result and confirm if the test failed for the intended reason.
- **Agent Confirms Analysis:** To resolve a `NEEDS_ANALYSIS` status, the agent calls `submit_work` again, this time providing its final `analysis_decision` (`SUCCESS` or `FAILURE`).
- **Automatic Preflight Check:** On any successful `PASS` expectation, the tool automatically runs the project's full `preflight` check as a final, non-negotiable quality gate before declaring true success.

## 4. The Workflow Phases (Lifecycle of a PR)


The orchestration logic guides the agent through the following phases for each Pull Request defined in a master plan document (e.g., `docs/Plan_Doc/Active_Plan.md`).

### 4.1 State Transition Table

This table details every state, the event that triggers a change, the conditions for that change, the actions the orchestrator performs, and the resulting state.

| Current State | Triggering Event | Condition(s) | Action(s) Performed by Orchestrator | Next State |
| :--- | :--- | :--- | :--- | :--- |
| **`INITIALIZING`** | `get_task` | `ACTIVE_PR.json` does not exist. | Instructs agent to create `ACTIVE_PR.json` from the master plan. | `INITIALIZING` |
| `INITIALIZING` | `submit_work` | Agent has created `ACTIVE_PR.json`. | Transitions state. | **`CREATING_BRANCH`** |
| **`CREATING_BRANCH`** | `get_task` | State is `CREATING_BRANCH`. | 1. Creates a branch name from `prTitle`.<br>2. Runs `git checkout main && git pull`.<br>3. Runs `git checkout -b [new_branch]`.<br>4. Saves branch name to state. | `EXECUTING_TDD` |
| **`EXECUTING_TDD`** | `get_task` | TDD steps are `TODO`. | Returns the description of the next TDD step. | `EXECUTING_TDD` |
| `EXECUTING_TDD` | `get_task` | All TDD steps in `ACTIVE_PR.json` are `DONE`. | Invokes the Code Review Agent by executing the `.agents/swe_agent/tools/request_code_review.sh` script. | `CODE_REVIEW` |
| `EXECUTING_TDD` | `submit_work` | Test passes (`PASS` expectation) AND `preflight` check passes. | Marks the current TDD step as `DONE`. | `EXECUTING_TDD` |
| `EXECUTING_TDD` | `submit_work` | Test fails unexpectedly OR `preflight` check fails. | 1. Saves error output to `last_error`.<br>2. Increments `debug_attempt_counter`. | `DEBUGGING` |
| **`DEBUGGING`** | `get_task` | State is `DEBUGGING`. | Returns `last_error` and provides debugging guidance. | `DEBUGGING` |
| `DEBUGGING` | `submit_work` | Agent's fix passes all checks. | 1. Clears `last_error`.<br>2. Clears `debug_attempt_counter`. | `EXECUTING_TDD` |
| `DEBUGGING` | `request_scope_reduction` | `debug_attempt_counter` threshold is met. | 1. Runs `git reset --hard HEAD`.<br>2. Saves error context for re-planning. | `REPLANNING` |
| **`REPLANNING`** | `get_task` | State is `REPLANNING`. | Instructs agent to create a new, more granular plan using the saved context. | `REPLANNING` |
| `REPLANNING` | `submit_work` | Agent submits an updated `ACTIVE_PR.json`. | Clears `last_error`. | `EXECUTING_TDD` |
| **`CODE_REVIEW`** | `get_task` | Review is approved (no findings). | Transitions state. | `AWAITING_FINALIZATION` |
| `CODE_REVIEW` | `get_task` | Review has findings. | Adds new tasks to `ACTIVE_PR.json` based on the review findings. | `EXECUTING_TDD` |
| **`AWAITING_FINALIZATION`** | `get_task` | State is `AWAITING_FINALIZATION`. | Instructs agent to squash all commits into a single commit. | `AWAITING_FINALIZATION` |
| `AWAITING_FINALIZATION` | `submit_work` | Agent submits the squashed commit hash. | 1. Verifies there is only one commit.<br>2. Saves the commit hash to state. | `FINALIZE_COMPLETE` |
| **`FINALIZE_COMPLETE`** | `get_task` | State is `FINALIZE_COMPLETE`. | Instructs agent to update the master plan file to mark the PR as `[DONE]`. | `FINALIZE_COMPLETE` |
| `FINALIZE_COMPLETE` | `submit_work` | Agent confirms the master plan is updated. | Transitions state. | **`PLAN_UPDATED`** |
| **`PLAN_UPDATED`** | `get_task` | State is `PLAN_UPDATED`. | Transitions state to prepare for the merge. | **`MERGING_BRANCH`** |
| **`MERGING_BRANCH`** | `get_task` | Merge to `main` is successful. | 1. `git checkout main && git pull`.<br>2. `git merge --no-ff [branch]`.<br>3. `git branch -d [branch]`.<br>4. Deletes `ACTIVE_PR.json`. | **`INITIALIZING`** |
| `MERGING_BRANCH` | `get_task` | Merge to `main` fails (conflict). | 1. Prints a clear error message to the user.<br>2. Halts all further execution. | **`HALTED` (Terminal)** |
| **`HALTED` (Terminal)** | Any | N/A | No actions. Requires human intervention to resolve the repository state. | `HALTED` |

### Phase 1: Initialization

The logic for the first `get_task` call is as follows:

1.  **Check for `ACTIVE_PR.json`:**
    - **If it does not exist:** The Orchestrator proceeds to step 2.
    - **If it exists:** The Orchestrator inspects the file.
      - If all tasks are marked `DONE`, it determines this is a stale artifact. It **deletes the file** and proceeds to step 2.
      - If there are pending tasks, it assumes a previous session was interrupted. It identifies the current task and returns it to the agent, allowing the workflow to resume.
2.  **Instruct Agent to Initialize:** The Orchestrator returns a single, high-level task: "Read the master plan file at `docs/Plan_Doc/Active_Plan.md`, identify the next PR to be implemented, and create the `ACTIVE_PR.json` state file. The file **must** conform to the following JSON schema..." (The orchestrator provides the schema here).
    ```jsonc
    // Sample ACTIVE_PR.json schema provided by the Orchestrator
    {
      "masterPlanPath": "string",
      "prTitle": "string",
      "summary": "string",
      "verificationPlan": "string",
      "tasks": [
        {
          "taskName": "string",
          "status": "TODO | IN_PROGRESS | DONE | ERROR",
          "tdd_steps": [
            {
              "type": "RED | GREEN | REFACTOR",
              "description": "string",
              "status": "TODO | DONE",
            },
          ],
        },
      ],
    }
    ```
3.  **Agent Executes:** The agent performs the reasoning-heavy task of parsing the markdown, finding the correct PR, extracting its details, and creating the `ACTIVE_PR.json` file according to the provided schema.
4.  **Agent Submits:** The agent calls `submit_work` to report that the initialization is complete. The TDD loop can now begin.
5.  **Orchestrator Creates Branch:** When `get_task` is called next, the orchestration logic sees the `INITIALIZING` state is complete. It transitions to a `CREATING_BRANCH` state, where it:
    a.  Reads the `prTitle` from `ACTIVE_PR.json`.
    b.  Sanitizes the title into a git-friendly branch name (e.g., "feat: Implement New Feature" -> `feat/implement-new-feature`).
    c.  **Crucially, runs `git checkout main` and `git pull` to ensure it's starting from the latest code.**
    d.  Executes `git checkout -b [new-branch-name]`.
    e.  Saves the new branch name to `ORCHESTRATION_STATE.json` in the `current_pr_branch` field.
    f.  Transitions the state to `EXECUTING_TDD` and returns the first TDD step to the agent.

### Phase 2: TDD Execution

This is the core development loop. The `get_task` tool provides one TDD step at a time, and the `submit_work` tool verifies the outcome. After each successful `GREEN`/`REFACTOR` step, the next task from `get_task` will be to create a safety checkpoint commit.

### Phase 3: The "Nudge and Unlock" Debugging Protocol

When a call to `submit_work` results in a `FAILURE`, the system enters a `DEBUGGING` state. The protocol is an agent-driven strategy guided by a hybrid "Nudge and Unlock" model managed by the `get_task` tool's logic. This prevents the agent from getting stuck in hopeless loops.

- **The Agent is the Strategist:** The agent decides _how_ to debug, using its standard toolkit (`read_file` to investigate, `safe_patch` to implement a fix or add logging, `submit_work` to test a hypothesis).

- **The "Nudge" (Dynamic Prompting):** The "Strategic Guidance" provided by `get_task` changes as the `debug_attempt_counter` increases:
  - **Attempts 1-2:** Nudges the agent to try a simple "Hypothesize & Fix."
  - **Attempts 3-5:** Strongly nudges the agent to change strategy and use instrumentation (logging) to gather more data.
  - **Attempts 6-9:** Strongly nudges the agent to conclude the task is too complex and that it should use the `request_scope_reduction` tool.

- **The "Unlock" (Tool-Gating):** The powerful "escape hatch" tools are protected by a hard lock.
  - `request_scope_reduction` and `escalate_for_external_help` are implemented as separate tools.
  - Their internal logic checks the `debug_attempt_counter` from `ORCHESTRATION_STATE.json`.
  - If called too early, they return an error, forcing the agent to continue with more direct debugging methods. They only "unlock" after a certain number of failed attempts.

---

**Attempt `max_attempts`: Revert, Re-plan, and Verify (Scope Reduction)**

If the Instrumentation Loop is exhausted, the Orchestrator concludes that the task's scope is the problem. It initiates a full reset and re-planning cycle.

1.  **Tool Logic Resets State:** The `request_scope_reduction` tool executes a deterministic `git reset --hard HEAD` to revert the file system to the last successful commit, wiping out all changes from the failed attempt. It saves the context of the failure (original task goal, error log).

2.  **Tool Logic Instructs Re-plan:**

    > "Your previous attempt failed and all changes have been reverted. Your new assignment is to create a more granular plan.
    >
    > 1.  Analyze the original goal: '[original task name]' and the final error: `[error log]`.
    > 2.  Break down the original task into the **smallest possible verifiable** Implementation Tasks, each with its own full Red-Green-Refactor cycle.
    > 3.  The **very last task** in your new plan **must be a 'Verification Task.'** This task's purpose is to prove that the preceding sub-tasks collectively achieve the original goal. Its `RED` step should be a recreation of the original task's `RED` step.
    > 4.  Update `ACTIVE_PR.json` to replace the original task with your new plan. The first new task must include a `breakdownHistory` object documenting the original goal and your justification."

3.  **Agent Creates New Plan:** The agent updates `ACTIVE_PR.json` with a new list of tasks, including the final verification task. The tool then returns control to the agent.
    ```jsonc
    // Sample ACTIVE_PR.json after a breakdown
    "tasks": [
      {
        "taskName": "Task 1a: Create ICachingProvider interface",
        "status": "TODO",
        "breakdownHistory": {
          "originalTaskName": "Task 1: Implement the 'Happy Path' of the Q&A Loop",
          "justification": "The original task was too broad. This new plan separates interface creation from implementation."
        },
        "tdd_steps": [ /* R-G-R for 1a */ ]
      },
      {
        "taskName": "Task 1b (Verification): Verify original 'Happy Path' goal",
        "status": "TODO",
        "tdd_steps": [
          { "type": "RED", "description": "Re-create the original test for the full Q&A loop happy path.", "status": "TODO" },
          { "type": "GREEN", "description": "The implementation from 1a should satisfy this test. Make any minimal changes required to make the test pass.", "status": "TODO" },
          { "type": "REFACTOR", "description": "Refactor the glue code from the GREEN step.", "status": "TODO" }
        ]
      }
    ]
    ```

---

**Final Escalation: External Help**

If the agent fails even on re-planned, smaller tasks, it signals a fundamental knowledge gap. The `get_task` logic will then instruct the agent to escalate for external help. The initial implementation of this escalation is a robust Human-in-the-Loop (HITL) handoff.

1.  **Agent Prepares Report:** The agent's final task is to generate a comprehensive markdown report. This report must detail the original goal, the steps and strategies it attempted, the final error message, and its analysis of the problem.
2.  **Agent Calls Handoff Tool:** The agent calls the `escalate_for_external_help` tool with the markdown report.
3.  **Tool Halts and Displays Report:** The tool's implementation prints the agent's report to the user's CLI and halts the autonomous execution loop. This returns control to the user.
4.  **User-in-the-Loop:** The user reads the report, conducts their own research or debugging, and provides new guidance, code snippets, or instructions back to the agent via the CLI. The agent then uses this new context to resume its work.

### Phase 4: Code Review

This phase ensures that all code changes meet quality standards through a rigorous, multi-stage verification loop.

1.  **Trigger:** After the agent successfully submits the final TDD step and it passes the orchestrator's `preflight` check, the orchestrator's state machine triggers the code review process.
2.  **Internal Review:** The orchestration logic invokes a separate Code Review Agent on the current state of the code by executing the `.agents/swe_agent/tools/request_code_review.sh` script. This script is responsible for packaging the necessary context (such as the current git diff and PR description) and calling the Code Review Agent. The review agent is responsible for all quality checks, including enforcing a "no temporary logs" policy.
3.  **Feedback & Cleanup Loop:**
    - **If the review is approved (no findings):** The workflow proceeds to Phase 5: Finalization.
    - **If the review has findings:** The orchestrator adds a new task to `ACTIVE_PR.json` (e.g., "Address code review feedback: [details]"). The SWE Agent receives this new task.
    - **Agent Fixes & Submits:** The agent implements the required changes and calls `submit_work`.
    - **Verification:** Crucially, this submission is treated like any other code change. The `submit_work` tool runs the full `preflight` check. If it fails, the agent enters the Debugging Protocol. If it passes, the state machine loops back to step 2 of this phase, triggering a _new_ code review on the updated code.
4.  This `fix -> verify -> review` cycle continues until a code review is approved with no findings.

### Phase 5: Finalization and Loop Continuation

This phase is a series of micro-tasks, guided by the orchestrator and executed by the agent, to cleanly wrap up the current PR and start the next one. This involves squashing the incremental TDD safety checkpoints into a single, meaningful commit that represents the entire feature, ensuring a clean and readable git history.

1.  **Instruction:** After the last task is verified, `get_task` instructs the agent to finalize the branch: "All tasks are complete. Squash all commits into a single commit using the PR title from `ACTIVE_PR.json` as the message."
2.  **Agent Finalizes:** The agent reads `ACTIVE_PR.json` and executes the `git` commands to squash the commits. It then calls `submit_work`.
3.  **Verification:** The `submit_work` tool deterministically verifies the branch state (e.g., by checking that `git rev-list --count main..HEAD` is `1`).
4.  **Instruction:** `get_task` instructs the agent: "Update the master plan at `docs/Plan_Doc/Active_Plan.md` to mark this PR as `[DONE]` and append the final commit hash."
5.  **Agent Updates Plan:** The agent, handling the unstructured markdown, updates the plan file and calls `submit_work`.
6.  **Transition to Merge:** When `submit_work` sees a submission confirming the plan update, it transitions the state to `MERGING_BRANCH`, handing off control to the final automated Git workflow phase.

### Phase 6: Automated Branch Merging and Workflow Continuation

This final phase replaces the manual handoff with a reliable, tool-driven process to merge the completed work and start the next cycle.

1.  **Orchestrator Merges and Cleans Up:** When `get_task` is called in the `MERGING_BRANCH` state, the orchestration logic performs the final Git operations:
    a.  Reads the `current_pr_branch` from the state file.
    b.  Executes `git checkout main`.
    c.  Executes `git pull` to ensure the main branch is up-to-date.
    d.  Executes `git merge --no-ff [current_pr_branch]`.
2.  **Safety Check and Loop:** The orchestrator checks the exit code of the merge command.
    - **If successful:** It proceeds to run `git branch -d [current_pr_branch]`, deletes the completed `ACTIVE_PR.json`, clears the `current_pr_branch` from the state file, and transitions the state back to `INITIALIZING`. The next call to `get_task` will start the entire workflow over for the next PR in the plan.
    - **If it fails (merge conflict):** This is the critical safety gate. The tool will **HALT** the entire operation, transitioning to a terminal `HALTED` state. It will print a clear error message to the user: `ERROR: Automated merge failed due to a conflict. Please resolve the conflict in branch '[current_pr_branch]' and merge it to main manually. Then, delete the branch and the 'ACTIVE_PR.json' file before restarting the agent to continue with the next PR.` This requires human intervention to fix the repository before the agent can continue, preventing the agent from corrupting the repository state.

## 5. Tool Schemas

The design's reliability comes from a minimal, robust, and explicit toolset.

```jsonc
[
  {
    "name": "get_task",
    "description": "Gets the next task or mission briefing from the stateless orchestration logic. Call this to get your goal.",
    "parameters": { "type": "OBJECT", "properties": {}, "required": [] },
  },
  {
    "name": "submit_work",
    "description": "The single gateway for all code verification. Has two modes: (1) To run a test, provide a 'test_command' and your 'expectation'. (2) To confirm the result of an ambiguous test run, provide your 'analysis_decision'. You are FORBIDDEN from using 'run_shell_command' to execute tests.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "summary": {
          "type": "STRING",
          "description": "A brief summary of the work you completed and its outcome.",
        },
        "test_command": {
          "type": "STRING",
          "description": "The command to run. Omit this when providing an 'analysis_decision'.",
        },
        "expectation": {
          "type": "STRING",
          "enum": ["PASS", "FAIL"],
          "description": "Your expectation for the test outcome. Omit this when providing an 'analysis_decision'.",
        },
        "analysis_decision": {
          "type": "STRING",
          "enum": ["SUCCESS", "FAILURE"],
          "description": "Your final judgment after analyzing a 'NEEDS_ANALYSIS' response. Use 'SUCCESS' if the test failed as intended, 'FAILURE' otherwise.",
        },
      },
      "required": ["summary"],
    },
    "returns": {
      "type": "OBJECT",
      "properties": {
        "status": {
          "type": "STRING",
          "enum": ["SUCCESS", "FAILURE", "NEEDS_ANALYSIS"],
        },
        "output": {
          "type": "STRING",
          "description": "The full, verbatim stdout and stderr from the test run.",
        },
      },
    },
  },
  {
    "name": "request_scope_reduction",
    "description": "Use this tool as an escape hatch when you conclude a task is too complex or ambiguous to be completed. This tool will revert all of your code changes to the last successful checkpoint and assign you a new task to break the original task down into smaller, more verifiable steps. This tool is locked until you have made several unsuccessful debugging attempts.",
    "parameters": { "type": "OBJECT", "properties": {}, "required": [] },
  },
  {
    "name": "escalate_for_external_help",
    "description": "Use this as a final escape hatch when you are stuck. This tool pauses the automated workflow and displays a detailed report to the human user, who will then provide guidance. You MUST generate a comprehensive markdown report detailing the problem, what you've tried, and relevant error messages. After calling this tool, the automated execution will STOP and wait for user input.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "markdown_report": {
          "type": "STRING",
          "description": "A comprehensive markdown report for the human user, detailing the issue, attempts made, and final error messages.",
        },
      },
      "required": ["markdown_report"],
    },
  },
]
```

## 6. Benefits of This Design

- **Reliability & Efficiency:** By embedding logic in tools and using state files, the agent's behavior becomes highly predictable and resistant to "runaway execution."
- **Decoupling:** The orchestration logic is largely decoupled from the codebase. Its main dependency is the `preflight` command, making the system adaptable.
- **Agent Flexibility:** The agent retains full autonomy in _how_ it implements a given step (which files to create/edit), as the orchestrator does not dictate implementation details.
- **Robustness:** The clear separation of concerns and the simple `get_task` recovery tool create a highly resilient and fault-tolerant system.
- **Testability & Extensibility:** The tool-based logic can be unit-tested, and new steps or entire phases (like an "Automated Documentation" phase) can be added to the workflow without altering the agent's core logic.
- **Transparency:** The use of explicit state files provides a clear, auditable trail of the workflow's progress, which aids both agent reasoning and human debugging.

## 7. Agile TDD Execution Plan

This section outlines the phased, TDD-driven implementation plan for the orchestration tools. The implementation itself will be the first use case for this workflow.

---

### **Phase 1: Initialization & Session Management**

**Goal:** Ensure the orchestrator can correctly start a new session, resume an interrupted one, and clean up stale sessions.

1.  **Task: Write Test for Initial PR Creation Instruction (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where no `ACTIVE_PR.json` exists.
    - **Assertion:** Assert that `get_task.sh` returns the instruction to read the master plan and create the `ACTIVE_PR.json` file.

2.  **Task: Implement Initial PR Creation Instruction (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add logic to check for the absence of `ACTIVE_PR.json` and, if so, return the initialization instruction.
    - **Assertion:** The test from the previous step should now pass.

3.  **Task: Write Test for Stale Session Cleanup (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where a valid `ACTIVE_PR.json` exists, but all tasks within it are marked `DONE`.
    - **Assertion:** Assert that `get_task.sh` deletes the stale `ACTIVE_PR.json` and returns the standard `INITIALIZING` instruction.

4.  **Task: Implement Stale Session Cleanup (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add logic at the beginning to check if `ACTIVE_PR.json` exists and if all its tasks are `DONE`. If so, delete the file before proceeding.
    - **Assertion:** The test from the previous step should now pass.

5.  **Task: Implement Basic State File Handling (Red)**
    - **Where:** `.agents/swe_agent/tests/state_management.test.sh`
    - **How:** Write a test that calls a `read_state` function which tries to read a non-existent `ORCHESTRATION_STATE.json`.
    - **Assertion:** Assert that the function exits with an error. The test will fail as the function doesn't exist.

6.  **Task: Implement Basic State File Handling (Green)**
    - **Where:** `.agents/swe_agent/tools/utils.sh`
    - **How:** Create a `read_state` function that reads the JSON file. Create a `write_state` function. In `get_task.sh`, if the state file doesn't exist, call `write_state` to create a default state (`{ "status": "INITIALIZING" }`).
    - **Assertion:** The test from the previous step should now pass by first ensuring the file doesn't exist, then calling `get_task.sh` and checking that the file is created.

7.  **Task: Write Test for Session Resumption (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where a valid `ACTIVE_PR.json` exists with the first TDD step marked `DONE` and the second marked `TODO`.
    - **Assertion:** Assert that `get_task.sh` returns the description of the second TDD step.

8.  **Task: Implement Session Resumption (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add logic to check for an existing `ACTIVE_PR.json` before initializing. If it exists, find the first `TODO` step and return it.
    - **Assertion:** The test from the previous step should now pass.

9.  **Task: Write Test for `INITIALIZING` State Transition (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Set state to `INITIALIZING`. Call `submit_work` with a summary indicating `ACTIVE_PR.json` was created.
    - **Assertion:** Assert that `ORCHESTRATION_STATE.json` is updated to `{ "status": "EXECUTING_TDD" }`.

10. **Task: Implement `INITIALIZING` State Transition (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** Add logic to check if the current state is `INITIALIZING`. If so, transition the state to `EXECUTING_TDD`.
    - **Assertion:** The test from the previous step should now pass.

---

### **Phase 2: The TDD & Debugging Cycle**

**Goal:** Implement the complete Red-Green-Refactor loop, the `preflight` quality gate, and the debugging protocol.

1.  **Task: Write Test for `preflight` Verification (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** Create a test that calls `submit_work.sh` with `expectation="PASS"` and a test command that exits 0. Mock the `npm` command.
    - **Assertion:** Assert that the mocked `npm run preflight` command was called.

2.  **Task: Implement `preflight` Verification (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** In the logic for a successful `PASS` expectation, add the command to execute `npm run preflight`.
    - **Assertion:** The test from the previous step should now pass.

3.  **Task: Write Test for `preflight` Failure (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** Create a test that calls `submit_work.sh` with `expectation="PASS"` and a test command that exits 0. Mock the `npm run preflight` command to exit with a non-zero status (e.g., 1).
    - **Assertion:** Assert that the tool's output status is `FAILURE` and that `ORCHESTRATION_STATE.json` is updated to `{ "status": "DEBUGGING", "debug_attempt_counter": 1 }`.

4.  **Task: Implement `preflight` Failure Handling (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** In the logic for a successful `PASS` expectation, after running `npm run preflight`, check its exit code. If it's non-zero, transition the state to `DEBUGGING`, save the error output, and return a `FAILURE` status.
    - **Assertion:** The test from the previous step should now pass.

5.  **Task: Write Test for `RED` Step `NEEDS_ANALYSIS` (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** Write a test that calls `submit_work.sh` with `expectation="FAIL"` and a command that correctly fails (exits 1).
    - **Assertion:** Assert that the tool's output is a JSON object with `status: "NEEDS_ANALYSIS"`.

6.  **Task: Implement `RED` Step `NEEDS_ANALYSIS` (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** Add logic to check for a `FAIL` expectation. If the command fails as expected, return the `NEEDS_ANALYSIS` status.
    - **Assertion:** The test from the previous step should now pass.

7.  **Task: Write Test for `analysis_decision` (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** Write a test that calls `submit_work.sh` with `analysis_decision="SUCCESS"`.
    - **Assertion:** Assert that the corresponding TDD step in `ACTIVE_PR.json` is updated to `DONE`.

8.  **Task: Implement `analysis_decision` Logic (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** Add logic to handle the `analysis_decision` parameter. If the decision is `SUCCESS`, find the current `IN_PROGRESS` TDD step in `ACTIVE_PR.json` and update its status to `DONE`.
    - **Assertion:** The test from the previous step should now pass.

9.  **Task: Write Test for Safety Checkpoint Instruction (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where the last TDD step was a `GREEN` or `REFACTOR` step.
    - **Assertion:** Assert that the next task from `get_task.sh` is to create a safety checkpoint commit.

10. **Task: Implement Safety Checkpoint Instruction (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add logic to check the type of the previously completed step. If it was `GREEN` or `REFACTOR`, return the commit instruction.
    - **Assertion:** The test from the previous step should now pass.

11. **Task: Write Test for `DEBUGGING` State Transition (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** Write a test that calls `submit_work.sh` with `expectation="PASS"` but a command that fails (exits 1).
    - **Assertion:** Assert that `ORCHESTRATION_STATE.json` is updated to `{ "status": "DEBUGGING", "debug_attempt_counter": 1 }`.

12. **Task: Implement `DEBUGGING` State Transition (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** Add logic to handle a mismatch between expectation and outcome. When this occurs, update the state to `DEBUGGING` and initialize or increment the `debug_attempt_counter`.
    - **Assertion:** The test from the previous step should now pass.

13. **Task: Write Test for "Nudge" Guidance and Error Context (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test with the state set to `DEBUGGING` and a `debug_attempt_counter` of 3. The state file should also contain the verbatim error log from the last failed `submit_work` call.
    - **Assertion:** Assert that `get_task.sh` returns the "Use Instrumentation" guidance and that the output **includes the verbatim error log** from the state file.

14. **Task: Implement "Nudge" Guidance and Error Context (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add a case for the `DEBUGGING` status that checks the `debug_attempt_counter` and returns the appropriate guidance based on the ranges defined in the design. Ensure it also reads the `last_error` from the state file and includes it in the response.
    - **Assertion:** The test from the previous step should now pass.

15. **Task: Write Test for `escalate_for_external_help` Tool Locking (Red)**
    - **Where:** `.agents/swe_agent/tests/escalate_for_external_help.test.sh`
    - **How:** Write a test where `debug_attempt_counter` is 1 and call `escalate_for_external_help.sh`.
    - **Assertion:** Assert that the script exits with an error and prints a message that the tool is locked.

16. **Task: Implement `escalate_for_external_help` Tool Locking (Green)**
    - **Where:** `.agents/swe_agent/tools/escalate_for_external_help.sh`
    - **How:** Add logic at the start of the script to read the `debug_attempt_counter` and exit if it's below the required threshold.
    - **Assertion:** The test from the previous step should now pass.

---

### **Phase 3: Escape Hatches & Recovery**

**Goal:** Implement the full suite of recovery and escalation tools.

1.  **Task: Write Test for Tool Locking (Red)**
    - **Where:** `.agents/swe_agent/tests/request_scope_reduction.test.sh`
    - **How:** Write a test where `debug_attempt_counter` is 1 and call `request_scope_reduction.sh`.
    - **Assertion:** Assert that the script exits with an error and prints a message that the tool is locked.

2.  **Task: Implement Tool Locking (Green)**
    - **Where:** `.agents/swe_agent/tools/request_scope_reduction.sh`
    - **How:** Add logic at the start of the script to read the `debug_attempt_counter` and exit if it's below the required threshold (e.g., 6).
    - **Assertion:** The test from the previous step should now pass.

3.  **Task: Write Test for Scope Reduction Re-planning and Context (Red)**
    - **Where:** `.agents/swe_agent/tests/request_scope_reduction.test.sh`
    - **How:** Write a test (with the tool unlocked) that mocks the `git` command and saves a sample error log and original task goal to the state.
    - **Assertion:** Assert that `git reset --hard HEAD` was called and that the tool's output contains the re-planning instruction, **populated with the original task's goal and the specific error log** that triggered the failure.

4.  **Task: Implement Scope Reduction Re-planning and Context (Green)**
    - **Where:** `.agents/swe_agent/tools/request_scope_reduction.sh`
    - **How:** Add the `git reset` command and update the orchestration state to `REPLANNING`. In `get_task.sh`, add a case for this state that returns the re-planning instruction, ensuring it reads and includes the saved original goal and error log.
    - **Assertion:** The test from the previous step should now pass.

5.  **Task: Write Test for `escalate_for_external_help` and Halt Signal (Red)**
    - **Where:** `.agents/swe_agent/tests/escalate_for_external_help.test.sh`
    - **How:** Write a test that calls `escalate_for_external_help.sh` with a sample markdown report.
    - **Assertion:** Assert that the script's standard output contains the exact markdown report and that the script **exits with a specific non-zero exit code** (e.g., 10) to signal a halt to the orchestrator.

6.  **Task: Implement `escalate_for_external_help` and Halt Signal (Green)**
    - **Where:** `.agents/swe_agent/tools/escalate_for_external_help.sh`
    - **How:** Create the script to `echo` its input argument to standard output and then `exit 10`.
    - **Assertion:** The test from the previous step should now pass.

---

### **Phase 4: Code Review & Finalization**

**Goal:** Implement the code review and PR finalization loops.

1.  **Task: Write Test for Code Review Trigger (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where all tasks in `ACTIVE_PR.json` are `DONE`.
    - **Assertion:** Assert that `get_task.sh` returns an instruction to run the code review.

2.  **Task: Implement Code Review Trigger (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add logic to check if all tasks are complete. If so, change the state to `CODE_REVIEW` and return the review instruction.
    - **Assertion:** The test from the previous step should now pass.

3.  **Task: Write Test for Handling Review Feedback (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** In a `CODE_REVIEW` state, call `submit_work` with a summary containing review findings.
    - **Assertion:** Assert that a new task is added to `ACTIVE_PR.json` with the feedback.

4.  **Task: Implement Handling Review Feedback (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** Add logic to check for the `CODE_REVIEW` state. If findings are present in the summary, parse them and append a new task to `ACTIVE_PR.json`. Transition the state back to `EXECUTING_TDD`.
    - **Assertion:** The test from the previous step should now pass.

5.  **Task: Write Test for Code Review Agent Invocation (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** In a `CODE_REVIEW` state, mock the `gemini` CLI command.
    - **Assertion:** Assert that `get_task.sh` calls the `gemini` command with the correct Code Review Agent persona and context files.

6.  **Task: Implement Code Review Agent Invocation (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** In the logic for the `CODE_REVIEW` state, add the shell command to invoke the `gemini` CLI non-interactively, passing the correct Code Review Agent persona and the required context files (`@ACTIVE_PR.json` and a diff). Capture the output.
    - **Assertion:** The test from the previous step should now pass.

7.  **Task: Write Test for Code Review Loop (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** Create a test where the agent submits a fix for a code review task. Mock the `npm run preflight` command.
    - **Assertion:** Assert that the orchestrator state transitions back to `CODE_REVIEW` after the submission is successful.

8.  **Task: Implement Code Review Loop (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** Add logic to detect when a code review fix is submitted. If the submission is successful (passes preflight), transition the state back to `CODE_REVIEW` to trigger a re-review.
    - **Assertion:** The test from the previous step should now pass.

9.  **Task: Write Test for Finalization Instruction (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where the state is `AWAITING_FINALIZATION` (or a similar state triggered after a successful code review).
    - **Assertion:** Assert that `get_task.sh` returns a clear instruction for the agent to execute the `git reset --soft ...` and `git commit` commands, using the title from `ACTIVE_PR.json`.

10. **Task: Implement Finalization Instruction (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add a case for the `AWAITING_FINALIZATION` state that reads the `prTitle` from `ACTIVE_PR.json` and returns the precise `git` commands for the agent to execute.
    - **Assertion:** The test from the previous step should now pass.

11. **Task: Write Test for Finalization Verification (Red)**
    - **Where:** `.agents/swe_agent/tests/submit_work.test.sh`
    - **How:** After a successful finalization submission, mock the `git rev-list` command.
    - **Assertion:** Assert that the `submit_work.sh` script calls the git command to verify the single commit and transitions the state to `FINALIZE_COMPLETE`.

12. **Task: Implement Finalization Verification (Green)**
    - **Where:** `.agents/swe_agent/tools/submit_work.sh`
    - **How:** Add logic to handle a submission when the state is `AWAITING_FINALIZATION`. This logic should execute `git rev-list --count main..HEAD` and check that the result is `1`. If successful, it transitions the state to `FINALIZE_COMPLETE`.
    - **Assertion:** The test from the previous step should now pass.

13. **Task: Write Test for Master Plan Update (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where the state is `FINALIZE_COMPLETE`.
    - **Assertion:** Assert that `get_task.sh` returns the instruction to update the master plan.

14. **Task: Implement Master Plan Update Instruction (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh`
    - **How:** Add a case for the `FINALIZE_COMPLETE` state that returns the instruction for the agent to update the master plan file.
    - **Assertion:** The test from the previous step should now pass.

15. **Task: Write Test for Loop Continuation (Red)**
    - **Where:** `.agents/swe_agent/tests/get_task.test.sh`
    - **How:** Create a test where the state is `PLAN_UPDATED`.
    - **Assertion:** Assert that `get_task.sh` returns the `INITIALIZING` instruction for the _next_ PR and that the old `ACTIVE_PR.json` has been deleted.

16. **Task: Implement Loop Continuation (Green)**
    - **Where:** `.agents/swe_agent/tools/get_task.sh` & `.agents/swe_agent/tools/submit_work.sh`
    - **How:**
      - In `submit_work.sh`, add logic to transition the state to `FINALIZE_COMPLETE` after a successful finalization.
      - In `get_task.sh`, add the case for `FINALIZE_COMPLETE` to return the "update master plan" instruction.
      - In `submit_work.sh`, add logic to transition the state to `PLAN_UPDATED`.
      - In `get_task.sh`, add the case for `PLAN_UPDATED` which deletes `ACTIVE_PR.json` and then returns the same output as the initial `INITIALIZING` state.
    - **Assertion:** The tests from the previous steps should now pass.

17. **Task: Update Agent Persona and Toolset (Non-TDD)**
    - **Where:** `.agents/swe_agent/swe_agent.prompt.md` and `.agents/swe_agent/settings.json`.
    - **How:** This is a configuration task. The prompt will be updated to the simple "get_task -> submit_work" loop. The `settings.json` will be updated to define the full, final toolset, mapping them to the newly created and tested shell scripts.
    - **Verification:** Verified by a final, end-to-end manual run of the entire workflow on a sample task.

---
