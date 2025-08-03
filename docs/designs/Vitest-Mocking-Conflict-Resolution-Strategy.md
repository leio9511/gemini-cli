

# **Advanced Strategies for Contextual Module Mocking in Vitest**

## **Introduction: The Challenge of Contextual Mocking in a Cached Module World**

The scenario presented—the need to mock Node.js core modules like fs/promises and crypto for a specific subset of tests while preserving their original functionality for others within the same file—is a classic manifestation of a fundamental challenge in modern JavaScript testing. This is not a simple configuration issue but a direct consequence of how ES Modules are designed to work and how test runners like Vitest optimize their execution. The conflict arises from the interplay of two core concepts: module caching and mock hoisting.

The root cause of this challenge lies in how Vitest handles module imports and mocking instructions. For performance, both Node.js and Vitest employ a **module cache**. When a module is imported for the first time, it is loaded, executed, and its exports are stored in a cache. Any subsequent import of that same module within the test run will receive the identical, cached object, not a fresh instance.1 This behavior is crucial for efficiency but becomes a source of test pollution if not managed explicitly. State from one test—such as a mocked module—can "leak" into another, violating the principle of test isolation.2

Compounding this is Vitest's default mocking mechanism, vi.mock. This function is subject to **hoisting**. Before any code is executed, Vitest performs a static analysis pass on the test file, identifies all vi.mock calls, and effectively moves them to the very top of the file's scope.3 This means a

vi.mock call is applied unconditionally to the entire file, long before any specific describe or it block is run. It is an "all or nothing" approach, making it inherently unsuitable for the kind of conditional, test-specific mocking required here.

This report provides a multi-layered solution to this intricate problem. It begins by deconstructing Vitest's mocking APIs to build a foundational understanding. It then presents a direct, tactical solution using the framework's advanced features to achieve the desired test-specific isolation. Building on this, it introduces more robust patterns for handling complex dependencies like the filesystem. Finally, the analysis ascends to a strategic, architectural level, exploring how to design code that obviates these complex mocking scenarios altogether, leading to more maintainable and resilient test suites.

## **Part I: Deconstructing Vitest's Module Mocking Mechanisms**

A clear understanding of Vitest's mocking tools is a prerequisite for solving the problem of contextual mocking. The choice between vi.mock and vi.doMock is not a matter of preference but a fundamental decision about timing and scope that dictates the entire testing strategy.

### **The Static World of vi.mock: The "All or Nothing" Approach**

The vi.mock(path, factory) function is the most common way to mock modules in Vitest, but its behavior is often misunderstood. Its defining characteristic is hoisting, a process where the mock declaration is moved to the top of the file during a pre-execution static analysis phase.4 This means that regardless of whether a

vi.mock call is written at the top level, inside a describe block, or even within a specific it test case, it is always executed *before* any import statements are resolved.

This pre-runtime application of mocks is what causes the user's conflict. Because the mock is applied globally to the file's module scope before any tests run, it's impossible to conditionally enable it for one test and disable it for another within that same file. The decision has already been made for the entire file. This behavior also means that the factory function provided to vi.mock cannot reference any variables defined in the test's scope, as those variables will not have been initialized at the time the hoisted factory function is executed.6

The appropriate use case for vi.mock is when a dependency must be mocked consistently across every single test within a file. For these scenarios, its declarative, file-scoped nature is simple and effective. However, for the present problem, it is precisely this behavior that makes it the incorrect tool for the job.

### **The Dynamic Alternative: vi.doMock for Runtime Control**

In direct contrast to vi.mock, the vi.doMock(path, factory) function is not hoisted.4 It is a standard function call that executes exactly where it is placed in the code, such as inside a

beforeEach hook or an it block. This runtime execution is the key to unlocking conditional, test-specific mocking.

The vi.doMock function works by programmatically instructing the Vitest module resolver: "For the *next* request to import the module at this path, disregard any cached version and instead return the result of this factory function".4 This gives the developer fine-grained control over when a mock is applied. It can be set up immediately before a specific test runs and then torn down afterward, leaving the module system clean for subsequent tests.

### **The Critical Symbiosis: vi.doMock and Dynamic import()**

Simply using vi.doMock is not enough. Its effectiveness is entirely dependent on the timing of module imports. If the module under test (SUT) or its dependencies are loaded via standard, top-level import... from '...' statements, the vi.doMock call will be too late. Those static imports are resolved and their results cached before any test code, including beforeEach hooks, has a chance to execute.1 The module is already in the cache, and

vi.doMock only affects *future* import requests.

The solution to this timing problem is the dynamic await import() expression. By using await import('./path/to/module.js') *after* the vi.doMock call has been made, the test forces a module resolution at runtime.6 At this point, the

vi.doMock instruction is active and can successfully intercept the request, providing the mocked version instead of the original.

A crucial and often overlooked detail is *which* module needs to be dynamically imported. The user's function, createVersionedFileObject, internally depends on fs/promises. If the test file statically imports createVersionedFileObject at the top, that function's reference to the original fs/promises module is resolved and locked in at that moment. A later vi.doMock('fs/promises',...) call will have no effect on the already-imported SUT.

Therefore, the most critical element of this pattern is that the **subject under test (SUT) itself**—the module containing createVersionedFileObject—must be the one that is dynamically imported. This ensures that when the SUT's code is evaluated for the first time in this isolated context, its internal import {... } from 'fs/promises' statement triggers a fresh module lookup. This lookup is then intercepted by the vi.doMock instruction that was just established, correctly wiring the SUT to the mocked dependency.7

## **Part II: A Strategic Blueprint for Test-Specific Mocking**

Armed with a theoretical understanding of Vitest's mocking mechanisms, it is now possible to construct a practical and reusable blueprint for implementing test-specific mocks. This pattern combines vi.doMock, dynamic import(), and proper cleanup to ensure robust test isolation.

### **The Core Pattern: A Reusable Template for Isolate-and-Mock**

The following template provides a clear, step-by-step implementation for mocking fs/promises and crypto for the new createVersionedFileObject tests, while allowing existing tests to continue using the real Node.js modules.

TypeScript

import { describe, it, expect, vi, afterEach } from 'vitest';

// Existing tests that require the REAL modules can live here or in other blocks.  
// They will use the original, un-mocked Node.js modules because no  
// file-level vi.mock is present, and the dynamic mocks below are cleaned up.  
describe('Tests with Original Node.js Modules', () \=\> {  
  it('should demonstrate use of the real fs/promises module', async () \=\> {  
    // Dynamically importing here for demonstration, but a static import would also work  
    // in a test file without hoisted mocks.  
    const fs \= await import('fs/promises');  
    // This will throw an error if it tries to write, proving it's the real module.  
    await expect(fs.writeFile('/nonexistent-path/file.txt', 'data')).rejects.toThrow();  
  });  
});

// A dedicated describe block for the new function and its mocked dependencies.  
describe('createVersionedFileObject \- Mocked Dependencies', () \=\> {  
  // This hook ensures that mocks are cleared after each test in this block.  
  // This prevents mock state from leaking into other tests.  
  afterEach(() \=\> {  
    vi.resetModules();  
  });

  it('should call fs.writeFile with a versioned filename and crypto.createHash', async () \=\> {  
    // Step 1: Define mock implementations using vi.fn().  
    // This allows us to track calls and control return values.  
    const mockWriteFile \= vi.fn().mockResolvedValue(undefined);  
    const mockCreateHash \= vi.fn().mockReturnValue({  
      update: vi.fn().mockReturnThis(), // Chainable method  
      digest: vi.fn().mockReturnValue('mocked-hash-string-123'),  
    });

    // Step 2: Apply the mocks at runtime using vi.doMock.  
    // These are not hoisted and will only apply to subsequent dynamic imports.  
    vi.doMock('fs/promises', () \=\> ({  
      // We only need to provide the functions our SUT uses.  
      writeFile: mockWriteFile,  
    }));  
    vi.doMock('node:crypto', () \=\> ({ // Using 'node:crypto' prefix is best practice  
      createHash: mockCreateHash,  
    }));

    // Step 3: Dynamically import the module under test.  
    // This is the CRITICAL step. It forces the module to be loaded \*after\*  
    // the vi.doMock instructions are in place, thereby receiving the mocks.  
    const { createVersionedFileObject } \= await import('./path/to/your/file.js');

    // Step 4: Execute the test logic.  
    const filePath \= 'data/report.txt';  
    const fileContent \= 'This is the file content.';  
    await createVersionedFileObject(filePath, fileContent);

    // Step 5: Assert that the mocks were called as expected.  
    expect(mockCreateHash).toHaveBeenCalledWith('sha256');  
    expect(mockCreateHash().update).toHaveBeenCalledWith(fileContent);  
    expect(mockWriteFile).toHaveBeenCalledTimes(1);  
    expect(mockWriteFile).toHaveBeenCalledWith(  
      'data/report-v-mocked-hash-string-123.txt',  
      fileContent  
    );  
  });

  // Another test within the same describe block can have different mock behaviors.  
  it('should handle errors from fs.writeFile', async () \=\> {  
    const writeError \= new Error('Disk full');  
    const mockWriteFile \= vi.fn().mockRejectedValue(writeError);

    vi.doMock('fs/promises', () \=\> ({  
      writeFile: mockWriteFile,  
    }));  
    // We don't need to mock crypto again if its behavior is the same.  
    // vi.doMock is idempotent for the same test scope if called again.

    const { createVersionedFileObject } \= await import('./path/to/your/file.js');

    await expect(createVersionedFileObject('log.txt', 'log data')).rejects.toThrow('Disk full');

    expect(mockWriteFile).toHaveBeenCalled();  
  });  
});

### **Ensuring Test Integrity: Cleanup, State Management, and Preventing Leakage**

The power of vi.doMock comes with the responsibility of manual cleanup. Without it, the mocks established for one test will persist in the module cache and pollute subsequent tests, leading to unpredictable failures and violating the core principle of test isolation.2

The canonical tool for this cleanup is vi.resetModules(). This function completely purges Vitest's module cache, forcing all modules to be re-imported from scratch in the next test.1 By placing

vi.resetModules() inside an afterEach or afterAll hook within the describe block that uses dynamic mocks, a clean state is guaranteed for any tests that run afterward. This effectively sandboxes the mocking behavior to just that block.

It is important to distinguish vi.resetModules() from its counterpart, vi.doUnmock(path). The doUnmock function is the direct inverse of vi.doMock; it removes the mock instruction for a specific module path for *future* imports.4 However, it does not affect modules that have already been imported and are sitting in the cache. For the purpose of completely isolating a

describe block and ensuring other tests reliably receive the original modules, vi.resetModules() is the more comprehensive and appropriate solution.

To provide a clear decision-making framework, the following table compares the key mocking and module management APIs in Vitest.

| Feature | vi.mock(path, factory) | vi.doMock(path, factory) | vi.resetModules() |
| :---- | :---- | :---- | :---- |
| **Execution Time** | **Hoisted (Pre-Runtime)**: Runs before any imports. | **Runtime**: Executes exactly where it is called. | **Runtime**: Executes exactly where it is called. |
| **Scope** | **Entire Test File**: Affects all tests in the file unconditionally. | **Test-Specific**: Affects module imports that occur after it is called. | **Global**: Affects the entire module cache for the test worker. |
| **Mechanism** | Static analysis replaces module imports before execution.4 | Programmatically intercepts the *next* module import request.7 | Purges the entire module registry, forcing re-import.1 |
| **Import Style** | Works with standard, top-level import. | **Requires** dynamic await import() for the SUT.6 | N/A |
| **Primary Use Case** | Mocking a dependency for all tests in a single file. | **(User's Scenario)** Mocking a dependency for a specific describe or it block. | Cleaning up module state between tests to ensure isolation. |
| **Cleanup** | vi.unmock(path) (hoisted) or vi.resetModules(). | vi.doUnmock(path) or vi.resetModules() (in afterEach/afterAll). | N/A |

## **Part III: Architectural Refinements for Superior Testability**

While the vi.doMock pattern effectively solves the immediate problem, the very need for such complex test setup can be an indicator of underlying architectural issues. This section explores more advanced techniques that not only improve the tests but also enhance the design of the application code itself, leading to systems that are inherently more testable and maintainable.

### **A More Robust Approach for Filesystems: memfs**

Manually mocking individual functions of the fs/promises module (writeFile, readFile, stat, etc.) with vi.fn() can quickly become brittle and tedious. If the implementation of createVersionedFileObject changes to, for example, first check if a directory exists using fs.stat, the test mock would need to be updated to include a mock for stat. This couples the test tightly to the implementation details of the function it is testing.9

A far more robust and scalable solution is to mock the entire filesystem dependency with an in-memory equivalent. The memfs library provides a complete, in-memory implementation of the Node.js fs API.9 Instead of mocking individual functions, the test can mock the entire

fs/promises module to point to memfs. This allows the SUT to interact with a complete, consistent, and isolated virtual filesystem.

This approach shifts the testing philosophy from behavioral verification (e.g., "was writeFile called with these arguments?") to state-based verification (e.g., "does a file with the correct name and content exist in the virtual filesystem after the function runs?"). State-based tests are often more resilient to refactoring because they are concerned with the outcome, not the specific steps taken to achieve it.

The following example demonstrates how to combine the dynamic mocking pattern with memfs:

TypeScript

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('createVersionedFileObject with memfs', () \=\> {  
  afterEach(() \=\> {  
    vi.resetModules();  
  });

  it('should correctly write a versioned file to the in-memory filesystem', async () \=\> {  
    // Step 1: Mock the fs/promises module to use the memfs implementation.  
    vi.doMock('fs/promises', async () \=\> {  
      // Use vi.importActual to get the real memfs library.  
      const memfs \= await vi.importActual\<typeof import('memfs')\>('memfs');  
      // Return the promises-based API of memfs.  
      return memfs.promises;  
    });

    // We still need to mock crypto as before.  
    vi.doMock('node:crypto', () \=\> ({  
      createHash: vi.fn().mockReturnValue({  
        update: vi.fn().mockReturnThis(),  
        digest: vi.fn().mockReturnValue('memfs-hash-456'),  
      }),  
    }));

    // Step 2: Dynamically import memfs's volume control and the SUT.  
    const { vol } \= await import('memfs');  
    const { createVersionedFileObject } \= await import('./path/to/your/file.js');

    // Step 3: Set up the state of the virtual filesystem for this test.  
    // vol.reset() ensures a clean slate, preventing state leakage between tests.  
    vol.reset();  
    // fromJSON can be used to create a directory structure.  
    vol.fromJSON({  
      '/app/data': null, // Creates an empty directory  
    });

    // Step 4: Execute the function.  
    await createVersionedFileObject('/app/data/log.txt', 'server log data');

    // Step 5: Assert against the final state of the virtual filesystem.  
    const directoryContents \= vol.readdirSync('/app/data');  
    expect(directoryContents).toHaveLength(1);  
    const newFilename \= directoryContents;  
    expect(newFilename).toBe('log-v-memfs-hash-456.txt');

    const writtenContent \= vol.readFileSync(\`/app/data/${newFilename}\`, 'utf-8');  
    expect(writtenContent).toBe('server log data');  
  });  
});

### **The Gold Standard: Dependency Injection to Eliminate Complex Mocking**

The most advanced and architecturally sound solution is to recognize that the difficulty in testing createVersionedFileObject is a "code smell".11 It signals that the function is tightly coupled to its dependencies. It has hard-coded, internal knowledge of where to find

fs/promises and crypto, making it difficult to test without manipulating the global module system.

The principle of **Dependency Injection (DI)** offers a powerful alternative. Instead of a component creating its own dependencies, those dependencies are "injected" from an external source.2 This pattern, also known as Inversion of Control (IoC), decouples the component from the concrete implementations of its dependencies.

Refactoring createVersionedFileObject to use DI transforms it into a "pure" function that is trivial to test. It no longer contains any import statements for its operational dependencies.

**Before Refactoring (Tightly Coupled):**

TypeScript

// file.js  
import { writeFile } from 'fs/promises';  
import { createHash } from 'node:crypto';

export async function createVersionedFileObject(path, content) {  
  // Logic that directly calls the imported writeFile and createHash functions.  
  const hash \= createHash('sha256').update(content).digest('hex');  
  //...  
  await writeFile(versionedPath, content);  
}

**After Refactoring (Loosely Coupled via DI):**

TypeScript

// file.js  
// The function is now pure. It has no direct knowledge of fs or crypto.  
export async function createVersionedFileObject(path, content, dependencies) {  
  const { fs, crypto } \= dependencies;  
  const hash \= crypto.createHash('sha256').update(content).digest('hex');  
  const versionedPath \= /\*... logic to create new path... \*/;  
  await fs.writeFile(versionedPath, content);  
}

// In the main application entry point, the real dependencies are provided.  
// main.js  
import { writeFile } from 'fs/promises';  
import { createHash } from 'node:crypto';  
import { createVersionedFileObject } from './file.js';

const realDependencies \= {  
  fs: { writeFile },  
  crypto: { createHash }  
};

// Production usage:  
// createVersionedFileObject('path/to/file.txt', 'some data', realDependencies);

With this refactoring, the test becomes radically simpler. All the complex machinery of vi.doMock, dynamic import(), and vi.resetModules vanishes. The test simply creates fake ("mock" or "stub") versions of the dependencies and passes them in.

**The Radically Simplified Test:**

TypeScript

import { describe, it, expect, vi } from 'vitest';  
import { createVersionedFileObject } from './path/to/refactored/file.js'; // Static import is now fine\!

describe('createVersionedFileObject (DI)', () \=\> {  
  it('should create a versioned file using injected dependencies', async () \=\> {  
    // No vi.doMock, no dynamic imports, no resetModules needed.

    // 1\. Create simple, lightweight fake dependencies for this test.  
    const fakeFs \= {  
      writeFile: vi.fn().mockResolvedValue(undefined),  
    };  
    const fakeCrypto \= {  
      createHash: vi.fn().mockReturnValue({  
        update: vi.fn().mockReturnThis(),  
        digest: vi.fn().mockReturnValue('fake-hash-789'),  
      }),  
    };  
    const dependencies \= { fs: fakeFs, crypto: fakeCrypto };

    // 2\. Inject the fakes when calling the function.  
    await createVersionedFileObject('test.txt', 'content', dependencies);

    // 3\. Assert on the fakes. The test is simple, fast, and readable.  
    expect(fakeCrypto.createHash).toHaveBeenCalledWith('sha256');  
    expect(fakeFs.writeFile).toHaveBeenCalledWith(  
      'test-v-fake-hash-789.txt',  
      'content'  
    );  
  });  
});

This approach reveals a profound principle: the challenges encountered during testing are not flaws in the testing framework but valuable feedback on the application's architecture. By embracing patterns like Dependency Injection, developers create code that is not only easier to test but also more modular, reusable, and maintainable in the long term. The test, in this sense, becomes a driver for better design.

## **Conclusion: A Hierarchy of Solutions for Maintainable Tests**

The challenge of conditionally mocking modules within a single Vitest file is solvable through a hierarchy of techniques, each with its own trade-offs regarding implementation complexity and architectural purity. The journey from a tactical fix to a strategic refactoring provides a clear path toward more robust and maintainable software.

The analysis yields a clear hierarchy of preference for addressing this and similar testing challenges:

1. **Gold Standard (Most Recommended): Dependency Injection.** The most robust, maintainable, and architecturally sound solution is to refactor the code to accept its dependencies as arguments. This eliminates the need for complex module system manipulation, resulting in tests that are simple, fast, explicit, and decoupled from framework-specific magic. It treats the difficulty of testing as a signal to improve the code's design.2  
2. **Silver Standard (Pragmatic Solution for Existing Code): Dynamic Mocking.** For codebases where immediate refactoring is not feasible, the combination of vi.doMock, dynamic await import(), and diligent cleanup with vi.resetModules is the correct and powerful pattern. It provides the necessary runtime control to isolate mocks to specific tests. For filesystem-heavy code, this pattern should be enhanced by using a complete in-memory filesystem like memfs to avoid brittle, implementation-coupled mocks.6  
3. **To Be Avoided (For This Specific Problem): File-Scoped vi.mock.** The use of the standard, hoisted vi.mock is inappropriate when contextual, test-specific mocking is required. Its "all or nothing" file-scoped behavior is the source of the conflict. Understanding its hoisting mechanism is crucial for recognizing when it is the wrong tool for the task.4

Ultimately, developers are now equipped with a comprehensive toolkit and a decision-making framework. They can effectively solve the immediate problem of contextual mocking while also possessing the architectural knowledge to diagnose and address such testability issues at their root, leading to higher-quality code and more resilient test suites.

#### **Works cited**

1. When using vi.doMock from vitest, I found that imports cannot be called ahead of time in JavaScript files, · Issue \#3763 \- GitHub, accessed August 3, 2025, [https://github.com/vitest-dev/vitest/issues/3763](https://github.com/vitest-dev/vitest/issues/3763)  
2. Avoid the pain of mocking modules with dependency injection \- NVNH.io \- software., accessed August 3, 2025, [https://nvnh.io/blog/avoid-the-pain-of-mocking-modules-with-dependency-injection/](https://nvnh.io/blog/avoid-the-pain-of-mocking-modules-with-dependency-injection/)  
3. Mocking | Guide \- Vitest, accessed August 3, 2025, [https://vitest.dev/guide/mocking](https://vitest.dev/guide/mocking)  
4. Vi | Vitest, accessed August 3, 2025, [https://vitest.dev/api/vi](https://vitest.dev/api/vi)  
5. Vi | Vitest v0.34, accessed August 3, 2025, [https://v0.vitest.dev/api/vi](https://v0.vitest.dev/api/vi)  
6. An advanced guide to Vitest testing and mocking \- LogRocket Blog, accessed August 3, 2025, [https://blog.logrocket.com/advanced-guide-vitest-testing-mocking/](https://blog.logrocket.com/advanced-guide-vitest-testing-mocking/)  
7. vi.doMock seems not to be working at all · Issue \#2967 \- GitHub, accessed August 3, 2025, [https://github.com/vitest-dev/vitest/issues/2967](https://github.com/vitest-dev/vitest/issues/2967)  
8. Vitest \- Share mock between test files \- Stack Overflow, accessed August 3, 2025, [https://stackoverflow.com/questions/78003391/vitest-share-mock-between-test-files](https://stackoverflow.com/questions/78003391/vitest-share-mock-between-test-files)  
9. Testing filesystem in Node.js: Please use memfs | Nerd For Tech \- Medium, accessed August 3, 2025, [https://medium.com/nerd-for-tech/testing-in-node-js-easy-way-to-mock-filesystem-883b9f822ea4](https://medium.com/nerd-for-tech/testing-in-node-js-easy-way-to-mock-filesystem-883b9f822ea4)  
10. Mock fs with vitest and memfs \- Kevin Schaul, accessed August 3, 2025, [https://kschaul.com/til/2024/06/26/mock-fs-with-vitest-and-memfs/](https://kschaul.com/til/2024/06/26/mock-fs-with-vitest-and-memfs/)  
11. Mocking a JavaScript class with Jest: mocking vs. dependency injection | Hacker News, accessed August 3, 2025, [https://news.ycombinator.com/item?id=33520354](https://news.ycombinator.com/item?id=33520354)  
12. Do you prefer Mock or Dependency Injection when Unit Testing Functions in Python?, accessed August 3, 2025, [https://www.reddit.com/r/Python/comments/195uk6d/do\_you\_prefer\_mock\_or\_dependency\_injection\_when/](https://www.reddit.com/r/Python/comments/195uk6d/do_you_prefer_mock_or_dependency_injection_when/)