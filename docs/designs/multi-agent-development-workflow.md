# The 3-Agent Automated Development Workflow

This workflow is designed to transform a high-level feature request into a series of clean, reviewed, and ready-to-merge commits on a feature branch. The process is orchestrated through structured markdown documents.

**High-Level Flow:**
`Plan Agent` -> `SWE Agent` -> `Code Review Agent` -> (loop) -> `SWE Agent` -> (repeat)


---

### System Artifacts and Git Strategy

This workflow relies on a set of documents that define the process and track its state. Proper organization and version control are critical.

#### Recommended Project Structure

All permanent artifacts for the agent workflow should be stored in a dedicated directory, such as `.agents/`.

```
my-project/
├── .agents/
│   ├── prompts/
│   │   ├── plan_agent.prompt.md
│   │   ├── swe_agent.prompt.md
│   │   └── code_review_agent.prompt.md
│   └── templates/
│       ├── planning-doc-template.md
│       └── pr_template.md
├── docs/
│   └── plans/
│       └── feature-x.plan.md
└── .gitignore
```

#### Artifact Lifecycle

| Artifact | Location | Git Tracked? | Rationale |
| :--- | :--- | :--- | :--- |
| **Core Personas** (`...prompt.md`) | `.agents/prompts/` | **Yes** | These are the "source code" for the agents' behavior and must be version-controlled for consistency. |
| **Permanent Templates** (`...template.md`) | `.agents/templates/` | **Yes** | These define the structure of the workflow and must be version-controlled. |
| **Feature Plans** (`...plan.md`) | `docs/plans/` | **Yes** | The official design document and blueprint for a feature. Serves as critical project documentation. |
| **`ACTIVE_PR.md`** | Project Root | **No** | A transient state-tracking file. It is created and deleted during a PR cycle and should be in `.gitignore`. |
| **`REVIEW_COMMENTS.md`** | Project Root | **No** | A transient communication channel. It is created and deleted during the review loop and should be in `.gitignore`. |

#### Recommended `.gitignore` Entries

```
# .gitignore

# Agent Workflow Files
/ACTIVE_PR.md
/REVIEW_COMMENTS.md
```

---

### Phase 0: The Blueprint (Planning)

*   **Agent:** `Plan Agent`
*   **Input:** A high-level feature request (e.g., "Add user profile caching").
*   **Actions:**
    1.  The Plan Agent uses the `planning-doc-template.md` to create a comprehensive plan for the feature.
    2.  Following the embedded guidance, it breaks the feature down into Phases and a series of small, dependent Pull Requests.
    3.  For each PR, it defines a clear Summary, a Verification Plan, and a checklist of Implementation Tasks. Each task represents a single TDD cycle.
*   **Output:** A detailed `[feature-name].plan.md` file. This document is the **master blueprint** and backlog for the entire feature.


---

### The PR Delivery Cycle

***This entire Phase 1-3 cycle repeats for each `Pull Request #[Number]` defined in the master plan.***

#### Phase 1: The Build Cycle (Implementation)

*   **Agent:** `SWE Agent`
*   **Input:** The `[feature-name].plan.md` and the `pr_template.md`.
*   **Actions:**
    1.  **Select Work:** Picks the next available `Pull Request #[Number]` from the plan.
    2.  **Create Branch:** Creates a new, dedicated feature branch from the *latest* `main` (e.g., `git checkout main && git pull && git checkout -b feature/pr-1-add-caching-service`).
    3.  **Create Work Order:** Creates the `ACTIVE_PR.md` file from the `pr_template.md`. It populates this file by copying the `PR Title`, `Summary`, `Verification Plan`, and the full list of `Planned Implementation Tasks` from the plan. This `ACTIVE_PR.md` is now the single source of truth for the current work cycle.
    4.  **Execute TDD Cycles:** For each `Task` listed in `ACTIVE_PR.md`, the agent performs the full Red-Green-Refactor cycle.
    5.  **Create Safety Checkpoint:** After each successful TDD cycle, the agent MUST run the full preflight check (e.g., `npm run preflight`) to ensure all tests pass, there are no type errors, and the code is linted. Once the preflight check is green, the agent creates a local micro-commit: `git add .` followed by `git commit -m "TDD: Implemented [task name]"`. This provides a safe rollback point.
*   **Output & Handoff:** A local feature branch with a series of small, incremental commits is created. The `SWE Agent`'s role is now paused. It MUST wait for the `Code Review Agent` to complete its review before proceeding. The process now moves to Phase 2.

#### Phase 2: The Verification Cycle (Review & Refinement)

*   **Agents:** `Code Review Agent` <-> `SWE Agent`
*   **Input:** The `ACTIVE_PR.md` and the local feature branch.
*   **Actions:**
    1.  **Review Goal:** The `Code Review Agent` reads `ACTIVE_PR.md` to understand what was supposed to be built.
    2.  **Analyze Code:** It runs `git diff main...HEAD` to see the cumulative result of all the `SWE Agent`'s work for this PR.
    3.  **Provide Feedback:** It writes its findings into a `REVIEW_COMMENTS.md` file in a structured JSON format. Approval is an empty `findings` array.
    4.  **Address Feedback:** The `SWE Agent` checks the `REVIEW_COMMENTS.md` file.
        *   If the `findings` array in the JSON is empty: The loop is over. The process moves to Phase 3.
        *   If comments exist: The `SWE Agent` reads the feedback, makes the necessary code changes, and commits them with `git commit -am "fix: Address review comments"`. The process then loops back to step 1 of this phase for another review.
*   **Output:** An approved set of changes on the local feature branch.

#### Phase 3: The Finalization (Merge Preparation)

*   **Agent:** `SWE Agent`
*   **Input:** The approved feature branch, and the master `[feature-name].plan.md`.
*   **Actions:**
    1.  **Squash History:** The agent runs `git reset --soft $(git merge-base HEAD main)` to combine all incremental TDD and fix-up commits into a single, staged change.
    2.  **Create Final Commit:** It creates one clean, final commit using the title from `ACTIVE_PR.md`: `git commit -m "feat: [PR Title]"`.
    3.  **Update Plan:** It finds the corresponding PR in the master plan file and marks it as `[DONE]`, appending the final commit hash.
    4.  **Cleanup:** It deletes the `ACTIVE_PR.md` and `REVIEW_COMMENTS.md` files.
*   **Output:** A clean local feature branch with a single, well-documented, and fully reviewed commit.

---

### Phase 4: The Handoff (Human-in-the-Loop)

The output of each PR Delivery Cycle is a local feature branch that is ready to be pushed to the remote repository. The responsibility for pushing the branch, opening the formal Pull Request, and merging into `main` is deliberately left to a human developer or a future, higher-privilege Orchestrator Agent.

#### Why the SWE Agent Does Not Merge to `main`

This separation of duties is a critical safety feature. The `SWE Agent`'s role is to automate the complex development and review work, but the final act of merging is a protected action for several reasons:

1.  **CI/CD as the Final Gatekeeper:** Most projects run an essential suite of tests, builds, and security scans on the Pull Request itself. The agent merging locally would bypass this authoritative quality gate.
2.  **Final Human Sanity Check:** The `main` branch is the project's source of truth. Allowing a human to perform a final review of the PR and its CI results provides a crucial safety net against unforeseen issues.
3.  **Merge Conflict Resolution:** While rare, complex merge conflicts require human intelligence to resolve correctly. The PR process is the correct forum for handling these situations.
4.  **Security and Permissions:** Granting an automated agent direct merge access to `main` is a significant security risk. The current model is more secure, requiring the agent only to have permissions to push to feature branches.

#### Handoff and Merge Process

*   **Responsibility:** Human Developer or future Orchestrator Agent.
*   **Actions:**
    1.  Push the finalized feature branch to the remote repository (e.g., `git push origin feature/pr-1-add-caching-service`).
    2.  Open a formal Pull Request in the Git hosting platform (e.g., GitHub).
    3.  Monitor the CI pipeline for a successful run.
    4.  Perform a final review.
    5.  Merge the Pull Request into the `main` branch.
    6.  Delete the remote feature branch.

This process repeats for every PR in the plan, ensuring continuous integration and a healthy `main` branch.



---

### Core Design Philosophy: The Statistical Reliability Model

The design of this multi-agent system is guided by a core philosophy aimed at ensuring reliable and predictable outcomes from agents that are, at their core, based on statistical models.

#### The Statistical Nature of LLM Agents

An LLM's reasoning process can be understood through an analogy with an Inertial Navigation System (INS). An INS can plot a highly accurate course over a short distance by making a series of complex calculations from a known starting point. However, each calculation introduces a tiny, unavoidable error. Over a long journey, these small errors accumulate, causing the system to "drift" significantly from its true position.

Similarly, an LLM agent performs a series of reasoning steps to accomplish a task. As a statistical model, each step has a non-zero probability of error (`x%`). For a task requiring `N` sequential reasoning steps, the cumulative probability of at least one error occurring can be expressed as `E = (1 - (1 - x%)^N)`. As `N` increases, this probability `E` approaches 1, making failure almost certain for complex, long-running tasks.



The critical failure point occurs when this accumulated "drift" pollutes the agent's context. Its internal understanding of the state of the world becomes incorrect, causing its subsequent predictions to be based on flawed premises, leading to a cascading failure from which it cannot recover.

#### Strategies for Managing Statistical Drift

To build a reliable system, there are three primary strategies to combat this issue:

1.  **Reduce `x%` (Improve Accuracy):** This involves using more powerful LLM models and investing heavily in careful context engineering (e.g., high-quality prompts, few-shot examples) to make each individual reasoning step as accurate as possible.

2.  **Implement Recovery Logic (Handle Polluted Context):** This involves designing sophisticated methods for an agent to detect when its context may be polluted and to take steps to recover. This could include summarizing its history, re-evaluating its initial goal, or other advanced error-correction techniques.

3.  **Reduce Scope (Minimize `N`):** This involves architecting the workflow so that an agent only needs to perform a small number of steps (`N`) before reaching an objective checkpoint that resets the statistical drift.

To build a robust system for complex tasks, all three strategies are important. However, this initial workflow design focuses primarily on **Strategy #3: Reduce Scope** as the most reliable and direct path to a predictable outcome.

#### The Principle of Verifiable Checkpoints

To counteract this drift, our system is built on the principle of frequent, verifiable checkpoints. We cannot eliminate the possibility of drift, but we can correct it at regular intervals. This is analogous to an INS being periodically corrected by an external, objective signal, like GPS.

This leads to three foundational design principles:

1.  **Every Automated Task Must Have a Verifiable Goal.** An agent's task must be defined by a concrete, measurable, and unambiguous goal. Success or failure should be a clear, objective state, not a matter of opinion.
    *   *Example:* The goal "make the tests pass" is verifiable. The goal "refactor the code to be better" is not easily verifiable by a machine.

2.  **Agents Must Have Tools to Verify Their Own Progress.** The agent performing the work must have direct access to the tools that measure success for its given task. This empowers it to self-assess, iterate, and determine when its work is truly "done."
    *   *Example:* The `SWE Agent` uses `npm run preflight` to verify that its code changes are valid and that the codebase is still healthy.

3.  **Failure is a Signal About Scope, Not Just the Agent.** When an agent fails to reach its verifiable goal, it should not be seen merely as a flaw in the agent's reasoning. It is a fundamental signal that the goal itself was likely too large, complex, or ambiguous for a single, verifiable step. The system's response should be to **reduce the scope** and provide the agent with a smaller, more manageable, and still verifiable goal.

#### Application in This Workflow

This philosophy dictates the separation of concerns in our workflow:

*   **The `Plan Agent` and Human Reviewer (The "Mission Planners"):** They perform the complex, creative work of breaking a large feature into a series of small, verifiable TDD steps. The human review of this plan acts as the primary "upfront" verification of the overall strategy.
*   **The `SWE Agent` (The "Executor"):** Its role is to execute one small, pre-verified step at a time. Its goal is simple and verifiable: make the test for the current step pass, and ensure the entire system remains healthy via `npm run preflight`. This minimizes the "drift" by making `N` (the number of steps between verifications) as small as possible.
*   **The `Code Review Agent` (The "Quality Inspector"):** It provides the final, higher-level verification, ensuring the implemented code not only works but is also well-designed and meets the overall goals of the PR.

By adhering to this model, we create a system that is more robust, predictable, and easier to debug, turning the inherent statistical nature of LLMs into a manageable engineering challenge.

---

### Future Work: The Orchestrator Agent

The workflow described above defines the roles and interactions of the specialist agents (`Plan`, `SWE`, `Code Review`) but requires a higher-level component to manage the overall process. This component is the **Orchestrator Agent**.

The Orchestrator is not a specialist; it is the **process manager** or "assembly line supervisor." Its responsibilities would include:

1.  **State Management:** Reading the master plan to determine which PR is next.
2.  **Agent Invocation:** Calling the correct specialist agent (`Plan`, `SWE`, or `Code Review`) at the appropriate time with the correct persona prompt.
3.  **State Transition:** Checking the output of one phase to decide which agent to call next (e.g., parsing `REVIEW_COMMENTS.md` to check if the `findings` array is empty).
4.  **Loop Management:** Managing the review/refinement loop between the `SWE Agent` and `Code Review Agent`.
5.  **Error Handling:** Pausing the workflow and flagging for human intervention if a step fails repeatedly.
6.  **Plan Completion:** After a PR is successfully finalized by the `SWE Agent`, the Orchestrator checks the master plan for any remaining PRs. If none are left, it updates the plan document to mark the entire feature as completed and performs any final cleanup.
7.  **(Optional) Automated Handoff:** A future Orchestrator with higher privileges could be tasked with the "Handoff" phase, including pushing branches and creating PRs.

The implementation of this Orchestrator is the next logical step to fully automate this development system.
