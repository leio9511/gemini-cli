## **Design Proposal: [Feature Name]**

**Status:** In Progress
**Author:** your-email@google.com
**Date:** YYYY-MM-DD
**Commit:** (leave blank until first commit)


### 1. Abstract

<!-- A brief, one-paragraph summary of the feature, the problem it solves, and the proposed solution. -->

### 2. Background & Problem Statement

<!-- A detailed explanation of the current situation and the problem that this feature will address. Explain why the current system is insufficient. -->

### 3. Goals & Non-Goals

#### Goals

<!-- List the specific, measurable goals of this feature. -->
<!-- What should this feature achieve? -->

#### Non-Goals

<!-- List what is explicitly out of scope for this feature. -->
<!-- This helps to define the boundaries of the project. -->

### 4. Proposed Design

<!-- A high-level overview of the proposed solution. This section should describe the new components, how they will interact, and the overall architecture of the feature. -->

#### 4.1. Component 1: [Component Name]

<!-- Detailed description of the first new component. -->

#### 4.2. Component 2: [Component Name]

<!-- Detailed description of the second new component. -->

### 5. Detailed Design

<!-- A more detailed, implementation-level description of the changes. This section should be specific enough for another engineer to understand the implementation details. -->

1.  **[First Area of Change]**
    - **Where:** <!-- Specify the file path, e.g., `packages/core/src/services/new-service.ts` -->
    - **How:** <!-- Describe the implementation details, including code snippets if helpful. -->

2.  **[Second Area of Change]**
    - **Where:** <!-- Specify the file path. -->
    - **How:** <!-- Describe the implementation details. -->

### 6. Test Plan

<!-- A detailed plan for testing the new feature. This should include unit tests, integration tests, and manual testing. -->

1.  **[Component 1] Tests (`path/to/component1.test.ts`):**
    - <!-- List the specific test cases for the first component. -->

2.  **[Component 2] Tests (`path/to/component2.test.ts`):**
    - <!-- List the specific test cases for the second component. -->





### 7. Agile Implementation Plan (TDD Flow)

<!-- Guidance for the Plan Agent:
Your goal is to create a robust, step-by-step implementation plan that minimizes risk and delivers value incrementally. To do this, you must adhere to the following core principles:

1.  **Think Vertically, Not Horizontally:** Decompose the feature into "vertical slices." Each PR should deliver a complete, testable piece of end-to-end functionality, even if it's very small.
    -   **BAD:** A PR that only adds database models. A separate PR that only adds API endpoints.
    -   **GOOD:** A PR that adds the ability for a user to read their profile. This includes the necessary database model, the API endpoint, and the tests to verify it.

2.  **Decompose and Order by Dependency:** Identify the logical sequence of work. What must be built first to enable subsequent work?
    -   **Example:** The PR that creates a user's profile must be implemented before the PR that allows editing that profile. The API for fetching data must exist before the UI that displays it.

3.  **Keep Pull Requests Small and Focused:** A PR should represent a single, logical unit of work and ideally be under 500 lines of code change. This reduces risk, makes code reviews faster and more effective, and makes it easier to find bugs. If a task seems too large, break it down into smaller, prerequisite PRs.

4.  **Define a Clear Verification Plan for Each PR:** For each PR, specify exactly how the changes can be tested and verified. This is the "definition of done" for the PR and is critical for the Code Review Agent. It should include specific test commands to run.
-->

---

#### **Phase 1: [Name of First Phase]**

<!-- **Goal:** Describe the goal of this phase. -->

**Pull Request #1: [Title of PR]**
- **Summary:** <!-- A brief, one-sentence description of what this PR will accomplish. -->
- **Verification Plan:** <!-- Detail the steps a reviewer will take to verify the changes. Include test commands and manual testing instructions. -->

**Implementation Tasks:**

**Task 1: [Name of first task, e.g., Handle H1 Headers]**
*   **TDD Steps:**
    1.  **Red:** <!-- Write a failing test for the specific behavior. -->
    2.  **Green:** <!-- Write the minimal code to make the test pass. -->
    3.  **Refactor (Optional):** <!-- Improve the implementation while keeping tests green. -->

**Task 2: [Name of second task, e.g., Handle Bold Text]**
*   **TDD Steps:**
    1.  **Red:** <!-- Write a failing test for the specific behavior. -->
    2.  **Green:** <!-- Write the minimal code to make the test pass. -->
    3.  **Refactor (Optional):** <!-- Improve the implementation while keeping tests green. -->

---

#### **Phase 2: [Name of Second Phase]**


<!-- **Goal:** Describe the goal of this phase. -->

**Pull Request #2: [Title of PR]**
- **Summary:** <!-- A brief, one-sentence description of what this PR will accomplish. -->
- **Verification Plan:** <!-- Detail the steps a reviewer will take to verify the changes. Include test commands and manual testing instructions. -->

**Implementation Tasks:**

**Task 1: [Name of first task]**
*   **TDD Steps:**
    1.  **Red:** <!-- Write a failing test for the specific behavior. -->
    2.  **Green:** <!-- Write the minimal code to make the test pass. -->
    3.  **Refactor (Optional):** <!-- Improve the implementation while keeping tests green. -->

...
