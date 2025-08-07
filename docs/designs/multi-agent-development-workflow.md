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

***This entire Phase 1-2-3 cycle repeats for each `Pull Request #[Number]` defined in the master plan.***

#### Phase 1: The Build Cycle (Implementation)

*   **Agent:** `SWE Agent`
*   **Input:** The `[feature-name].plan.md` and the `pr_template.md`.
*   **Actions:**
    1.  **Select Work:** Picks the next available `Pull Request #[Number]` from the plan.
    2.  **Create Branch:** Creates a new, dedicated feature branch from the *latest* `main` (e.g., `git checkout main && git pull && git checkout -b feature/pr-1-add-caching-service`).
    3.  **Create Work Order:** Creates the `ACTIVE_PR.md` file from the `pr_template.md`. It populates this file by copying the `PR Title`, `Summary`, `Verification Plan`, and the full list of `Planned Implementation Tasks` from the plan. This `ACTIVE_PR.md` is now the single source of truth for the current work cycle.
    4.  **Execute TDD Cycles:** For each `Task` listed in `ACTIVE_PR.md`, the agent performs the full Red-Green-Refactor cycle.
    5.  **Create Safety Checkpoint:** After each successful TDD cycle (i.e., the tests are green), the agent creates a local micro-commit: `git add .` followed by `git commit -m "TDD: Implemented [task name]"`. This provides a safe rollback point.
*   **Output:** A local feature branch with a series of small, incremental commits, ready for a review.

#### Phase 2: The Verification Cycle (Review & Refinement)

*   **Agents:** `Code Review Agent` <-> `SWE Agent`
*   **Input:** The `ACTIVE_PR.md` and the local feature branch.
*   **Actions:**
    1.  **Review Goal:** The `Code Review Agent` reads `ACTIVE_PR.md` to understand what was supposed to be built.
    2.  **Analyze Code:** It runs `git diff main...HEAD` to see the cumulative result of all the `SWE Agent`'s work for this PR.
    3.  **Provide Feedback:** It writes its findings into a `REVIEW_COMMENTS.md` file. If the work is perfect, it writes `LGTM`.
    4.  **Address Feedback:** The `SWE Agent` checks the `REVIEW_COMMENTS.md` file.
        *   If `LGTM`: The loop is over. The process moves to Phase 3.
        *   If comments exist: The `SWE Agent` reads the feedback, makes the necessary code changes, and commits them with `git commit -am "fix: Address review comments"`. The process then loops back to step 1 of this phase for another review.
*   **Output:** An approved set of changes on the local feature branch.

#### Phase 3: The Finalization (Merge Preparation)

*   **Agent:** `SWE Agent`
*   **Input:** The approved feature branch with its history of micro-commits.
*   **Actions:**
    1.  **Squash History:** The agent runs `git reset --soft $(git merge-base HEAD main)` to combine all incremental TDD and fix-up commits into a single, staged change.
    2.  **Create Final Commit:** It creates one clean, final commit using the title from `ACTIVE_PR.md`: `git commit -m "feat: [PR Title]"`.
    3.  **Cleanup:** It deletes the `ACTIVE_PR.md` and `REVIEW_COMMENTS.md` files.
*   **Output:** A clean local feature branch with a single, well-documented, and fully reviewed commit.

---

### Final Result

The output of each PR Delivery Cycle is a local feature branch that is ready to be pushed to the remote repository. A human developer then opens a formal Pull Request from this branch into `main`. After passing the project's official CI pipeline and receiving final human approval, the PR is merged. This process repeats for every PR in the plan, ensuring continuous integration and a healthy `main` branch.

---

### Future Work: The Orchestrator Agent

The workflow described above defines the roles and interactions of the specialist agents (`Plan`, `SWE`, `Code Review`) but requires a higher-level component to manage the overall process. This component is the **Orchestrator Agent**.

The Orchestrator is not a specialist; it is the **process manager** or "assembly line supervisor." Its responsibilities would include:

1.  **State Management:** Reading the master plan to determine which PR is next.
2.  **Agent Invocation:** Calling the correct specialist agent (`Plan`, `SWE`, or `Code Review`) at the appropriate time with the correct persona prompt.
3.  **State Transition:** Checking the output of one phase to decide which agent to call next (e.g., reading `REVIEW_COMMENTS.md` to see if it contains `LGTM`).
4.  **Loop Management:** Managing the review/refinement loop between the `SWE Agent` and `Code Review Agent`.
5.  **Error Handling:** Pausing the workflow and flagging for human intervention if a step fails repeatedly.

The implementation of this Orchestrator is the next logical step to fully automate this development system.

