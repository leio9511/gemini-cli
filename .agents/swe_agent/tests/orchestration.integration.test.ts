/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';




const execAsync = promisify(exec);

const BASE_DIR = path.resolve(__dirname, '..');
const TOOLS_DIR = path.resolve(BASE_DIR, 'tools');

async function simulateAgentTurn(
  tool: 'get_task' | 'submit_work' | 'request_scope_reduction',
  args: string[] = [],
  testDir: string,
  options: {
    env?: Record<string, string>;
    mocks?: Record<string, string>;
  } = {},
) {
  let command = `bash ${path.resolve(TOOLS_DIR, `${tool}.sh`)} ${args.join(
    ' ',
  )}`;

  // Check if the command is in mocks
  if (options.mocks) {
    const mockKey = Object.keys(options.mocks).find((key) =>
      command.includes(key),
    );
    if (mockKey) {
      command = options.mocks[mockKey];
    }
  }

  const env = {
    ...process.env,
    ...options.env,
    PATH: `${path.join(testDir, 'node_modules', '.bin')}:${process.env.PATH}`,
  };
  console.log(`Executing command: ${command}`);
  const result = await execAsync(command, { cwd: testDir, env: env });
  console.log(`stdout: ${result.stdout}`);
  console.log(`stderr: ${result.stderr}`);
  return result;
}

describe('SWE Agent Orchestration', () => {
  let testDir: string;


  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'swe-agent-test-'));
    await execAsync('git init', { cwd: testDir });
    await execAsync('git commit --allow-empty -m "Initial commit"', { cwd: testDir });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should transition from [NO_STATE] to INITIALIZING', async () => {
    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    // Verify output
    expect(stdout).toContain('Please read the plan file');

    // Verify state
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('INITIALIZING');
  });

  it('should transition from INITIALIZING to EXECUTING_TDD and create a branch', async () => {
    // Setup: Start in INITIALIZING state
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'INITIALIZING' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({
        prTitle: 'test pr',
        tasks: [
          {
            name: 'task 1',
            status: 'TODO',
            tdd_steps: [
              { type: 'RED', description: 'Make test fail', status: 'TODO' },
            ],
          },
        ],
      }),
    );

    await simulateAgentTurn('submit_work', [], testDir);

    // Verify state
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('EXECUTING_TDD');

    // Verify git command was called
    expect(vi.mocked(exec).mock.calls[0][0]).toContain(
      'git checkout main && git pull && git checkout -b "feature/test-pr"',
    );
  });

  it('should transition to HALTED when ACTIVE_PR.json is malformed', async () => {
    // Setup: Start in INITIALIZING state
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'INITIALIZING' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      'this is not json',
    );

    await expect(
      simulateAgentTurn('submit_work', [], testDir),
    ).rejects.toThrow();

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('HALTED');
  });

  it('should clean up stale sessions', async () => {
    // Setup: Create a dummy state file but no ACTIVE_PR.json
    const statePath = path.join(testDir, 'ORCHESTRATION_STATE.json');
    await fs.writeFile(statePath, JSON.stringify({ status: 'EXECUTING_TDD' }));

    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    expect(stdout).toContain('Stale session cleaned. Please start again.');
    // Verify the stale state file is deleted
    await expect(fs.access(statePath)).rejects.toThrow();
  });

  it('should clean up completed sessions', async () => {
    // Setup: Create an ACTIVE_PR.json where all tasks are done
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        { name: 'task 1', status: 'DONE' },
        { name: 'task 2', status: 'DONE' },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));

    await simulateAgentTurn('get_task', [], testDir);

    // Verify the stale ACTIVE_PR.json is deleted
    await expect(fs.access(activePRPath)).rejects.toThrow();
  });

  it('should resume an interrupted session', async () => {
    // Setup: Create an ACTIVE_PR.json with mixed task statuses
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        { name: 'task 1', status: 'DONE', tdd_steps: [] },
        {
          name: 'task 2',
          status: 'TODO',
          tdd_steps: [{ description: 'Do the thing', status: 'TODO' }],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));

    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    expect(stdout).toContain('Do the thing');
  });

  it('should transition from EXECUTING_TDD to EXECUTING_TDD on a green step', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to EXECUTING_TDD
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'GREEN', description: 'Make test pass', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    await simulateAgentTurn(
      'submit_work',
      ['"echo success"', 'PASS'],
      testDir,
      {
        env: { SKIP_PREFLIGHT: 'true' },
      },
    );

    const updatedPR = JSON.parse(await fs.readFile(activePRPath, 'utf-8'));
    expect(updatedPR.tasks[0].tdd_steps[0].status).toBe('DONE');
  });

  it('should transition to DEBUGGING on unexpected test failure', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to EXECUTING_TDD
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            {
              type: 'GREEN',
              description: 'This should pass but will fail',
              status: 'TODO',
            },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    // Simulate a green step that unexpectedly fails
    await simulateAgentTurn('submit_work', ['"exit 1"', 'PASS'], testDir);

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('DEBUGGING');
    expect(state.last_error).toContain('Unexpected test failure');
  });

  it('should provide debugging guidance when in DEBUGGING state', async () => {
    // Setup: Set state to DEBUGGING
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'DEBUGGING',
        last_error: 'Something went wrong',
      }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({
        tasks: [
          {
            name: 'task 1',
            status: 'TODO',
            tdd_steps: [
              { type: 'RED', description: 'Make test fail', status: 'TODO' },
            ],
          },
        ],
      }),
    );

    const { stdout } = await simulateAgentTurn('get_task', [], testDir);
    expect(stdout).toContain('A test failed unexpectedly');
  });

  it('should transition from DEBUGGING to EXECUTING_TDD after a successful fix', async () => {
    // Setup: Set state to DEBUGGING
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'DEBUGGING',
        last_error: 'Something went wrong',
      }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({
        tasks: [
          {
            name: 'task 1',
            status: 'TODO',
            tdd_steps: [
              { type: 'RED', description: 'Make test fail', status: 'TODO' },
            ],
          },
        ],
      }),
    );

    // Simulate submitting a fix
    const { stdout } = await simulateAgentTurn(
      'submit_work',
      ['"echo success"'],
      testDir,
    );

    // Verify output
    expect(stdout).toContain('Your goal is to complete the next TDD step');
  });

  it('should prevent recovery tools from being used too early', async () => {
    // Setup: Set state to DEBUGGING with a low attempt count
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'DEBUGGING',
        debug_attempt_counter: 1,
      }),
    );

    await expect(
      simulateAgentTurn('request_scope_reduction', [], testDir),
    ).rejects.toThrow('This tool is locked.');
  });

  it('should prevent escalation when debug attempts are low', async () => {
    // Setup: Set state to DEBUGGING with a low attempt count
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'DEBUGGING',
        debug_attempt_counter: 1,
      }),
    );




    await expect(
      simulateAgentTurn('escalate_for_external_help', [], testDir),
    ).rejects.toThrow('This tool is locked');
  });

  it('should transition to REPLANNING after enough failed debug attempts', async () => {
    // Setup: Set state to DEBUGGING with a high attempt count
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'DEBUGGING',
        debug_attempt_counter: 10, // High enough to unlock the tool
      }),
    );

    const { stdout } = await simulateAgentTurn(
      'request_scope_reduction',
      [],
      testDir,
    );

    expect(stdout).toContain('Entering REPLANNING state');
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('REPLANNING');
  });

  it('should provide re-planning instructions when in REPLANNING state', async () => {
    // Setup: Set state to REPLANNING
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'REPLANNING' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({ tasks: [] }),
    );

    const { stdout } = await simulateAgentTurn('get_task', [], testDir);
    expect(stdout).toContain('Please provide an updated ACTIVE_PR.json file.');
  });

  it('should transition from REPLANNING to EXECUTING_TDD after submitting a new plan', async () => {
    // Setup: Set state to REPLANNING
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'REPLANNING' }),
    );
    const updatedPR = {
      tasks: [{ name: 'new task', status: 'TODO', tdd_steps: [] }],
    };
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify(updatedPR),
    );

    const { stdout } = await simulateAgentTurn('submit_work', [], testDir);
    expect(stdout).toContain('Your goal is to complete the next TDD step');
  });

  it('should escalate when requested after enough debug attempts', async () => {
    // Setup: Set state to DEBUGGING with a high attempt count
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'DEBUGGING',
        debug_attempt_counter: 10,
      }),
    );

    const { stdout } = await simulateAgentTurn(
      'escalate_for_external_help',
      [],
      testDir,
    );
    expect(stdout).toContain(
      'Escalating for external help. Please provide a new ACTIVE_PR.json file.',
    );
  });

  it('should transition to CODE_REVIEW when all tasks are done', async () => {
    // Setup: Create an ACTIVE_PR.json where all tasks are done
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        { name: 'task 1', status: 'DONE' },
        { name: 'task 2', status: 'DONE' },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    // Verify output
    expect(stdout).toContain('All tasks are complete. Requesting code review.');

    // Verify state
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('CODE_REVIEW');
  });

  it('should transition from CODE_REVIEW to AWAITING_FINALIZATION on approval', async () => {
    // Setup: Set state to CODE_REVIEW
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'CODE_REVIEW' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({ tasks: [] }),
    );

    // Simulate an approved code review
    const { stdout } = await simulateAgentTurn(
      'submit_work',
      ['\'{"findings":[]}\''],
      testDir,
    );

    // Verify output
    expect(stdout).toContain('Code review approved');

    // Verify state
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('AWAITING_FINALIZATION');
  });

  it('should transition from CODE_REVIEW to EXECUTING_TDD when there are findings', async () => {
    // Setup: Set state to CODE_REVIEW
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'CODE_REVIEW' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({ tasks: [] }),
    );

    // Simulate a code review with findings
    const findings = [
      {
        file_path: 'src/index.js',
        description: 'Fix this',
        recommendation: 'Do that',
      },
    ];
    const { stdout } = await simulateAgentTurn(
      'submit_work',
      [`'${JSON.stringify({ findings })}'`],
      testDir,
    );

    // Verify output
    expect(stdout).toContain('New tasks have been added');

    // Verify state
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('EXECUTING_TDD');
  });

  it('should transition from EXECUTING_TDD to CODE_REVIEW after a fix is submitted', async () => {
    // Setup: Create an ACTIVE_PR.json with a single task to fix a finding
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'GREEN', description: 'Fix the finding', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    // Simulate submitting the fix
    await simulateAgentTurn(
      'submit_work',
      ['"echo success"', 'PASS'],
      testDir,
      {
        env: { SKIP_PREFLIGHT: 'true' },
      },
    );

    // Now all tasks are done, so calling get_task should transition to CODE_REVIEW
    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    // Verify output
    expect(stdout).toContain('All tasks are complete. Requesting code review.');

    // Verify state
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('CODE_REVIEW');
  });

  it('should transition to HALTED on a merge conflict', async () => {
    // Setup: Set state to MERGING_BRANCH
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'MERGING_BRANCH' }),
    );
    // Create a dummy ACTIVE_PR.json
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({ tasks: [] }),
    );

    // Simulate a merge conflict
    try {
      await simulateAgentTurn('submit_work', ['"exit 1"'], testDir);
    } catch (e) {
      expect(e.code).toBe(1);
    }
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('HALTED');
  });

  it('should take no action in HALTED state', async () => {
    // Setup: Set state to HALTED
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'HALTED' }),
    );

    await expect(simulateAgentTurn('get_task', [], testDir)).rejects.toThrow(
      'Command failed',
    );
  });

  it('should use mocked commands when provided', async () => {
    const mocks = {
      'get_task.sh': 'echo "mocked output"',
    };
    const { stdout } = await simulateAgentTurn('get_task', [], testDir, {
      mocks,
    });
    expect(stdout).toContain('mocked output');
  });

  it('should mark a green TDD step as DONE after a successful run', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to EXECUTING_TDD
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'GREEN', description: 'Make test pass', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    await simulateAgentTurn(
      'submit_work',
      ['"echo success"', 'PASS'],
      testDir,
      {
        env: { SKIP_PREFLIGHT: 'true' },
      },
    );

    const updatedPR = JSON.parse(await fs.readFile(activePRPath, 'utf-8'));
    expect(updatedPR.tasks[0].tdd_steps[0].status).toBe('DONE');

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('EXECUTING_TDD');
  });

  it('should transition to NEEDS_ANALYSIS on a red step', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to EXECUTING_TDD
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'RED', description: 'Make test fail', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    // Simulate a failing red step
    const { stdout } = await simulateAgentTurn(
      'submit_work',
      ['"exit 1"', 'FAIL'],
      testDir,
    );

    expect(stdout).toContain('NEEDS_ANALYSIS');
  });

  it('should get the next TDD step', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to EXECUTING_TDD
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'RED', description: 'Make test fail', status: 'TODO' },
            { type: 'GREEN', description: 'Make test pass', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    expect(stdout).toContain('Make test fail');
  });

  it('should transition from Awaiting Analysis to EXECUTING_TDD on SUCCESS', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to AWAITING_ANALYSIS
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'RED', description: 'Make test fail', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'AWAITING_ANALYSIS' }),
    );

    await simulateAgentTurn('submit_work', ['SUCCESS'], testDir);

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('EXECUTING_TDD');
  });

  it('should transition from Awaiting Analysis to DEBUGGING on FAILURE', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to AWAITING_ANALYSIS
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'RED', description: 'Make test fail', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'AWAITING_ANALYSIS' }),
    );

    await simulateAgentTurn('submit_work', ['FAILURE'], testDir);

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('DEBUGGING');
  });

  it('should transition to DEBUGGING when the preflight check fails', async () => {
    // Setup: Create an ACTIVE_PR.json with a TODO task and set state to EXECUTING_TDD
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'GREEN', description: 'Make test pass', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD' }),
    );

    // Create a mock npm script that fails
    const binDir = path.join(testDir, 'node_modules', '.bin');
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(
      path.join(binDir, 'npm'),
      '#!/bin/bash\nif [ "$1" == "run" ] && [ "$2" == "preflight" ]; then exit 1; else exit 0; fi',
      { mode: 0o755 },
    );

    await expect(
      simulateAgentTurn('submit_work', ['"echo success"', 'PASS'], testDir, {
        env: { SKIP_PREFLIGHT: 'false' },
      }),
    ).rejects.toThrow();

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('DEBUGGING');
  });

  it('should transition from AWAITING_FINALIZATION to FINALIZE_COMPLETE', async () => {
    // Setup: Initialize a git repository
    await execAsync('git init', { cwd: testDir });
    await execAsync('git config user.email "test@example.com"', {
      cwd: testDir,
    });
    await execAsync('git config user.name "Test User"', { cwd: testDir });
    await execAsync('git commit --allow-empty -m "Initial commit"', {
      cwd: testDir,
    });
    await execAsync('git commit --allow-empty -m "feat: A"', { cwd: testDir });
    await execAsync('git commit --allow-empty -m "feat: B"', { cwd: testDir });
    await execAsync('git reset --soft HEAD~2', { cwd: testDir });
    await fs.writeFile(path.join(testDir, 'test.txt'), 'test');
    await execAsync('git add test.txt', { cwd: testDir });
    await execAsync('git commit -m "feat: Squashed"', { cwd: testDir });
    const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
      cwd: testDir,
    });

    // Setup: Set state to AWAITING_FINALIZATION
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'AWAITING_FINALIZATION' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({ prTitle: 'test pr' }),
    );

    const { stdout } = await simulateAgentTurn(
      'submit_work',
      [commitHash.trim()],
      testDir,
    );

    expect(stdout).toContain('VERIFIED');

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('FINALIZE_COMPLETE');
    expect(state.last_commit_hash).toBe(commitHash.trim());
  });

  it('should instruct to update the plan when in FINALIZE_COMPLETE state', async () => {
    // Setup: Set state to FINALIZE_COMPLETE
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'FINALIZE_COMPLETE',
        last_commit_hash: 'some_hash',
      }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({
        prTitle: 'test pr',
        masterPlanPath: 'docs/plans/test.plan.md',
      }),
    );

    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    // Verify state remains the same
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('FINALIZE_COMPLETE');

    // Verify output
    expect(stdout).toMatch(/update the master plan/i);
  });

  it('should transition from FINALIZE_COMPLETE to PLAN_UPDATED', async () => {
    // Setup: Set state to FINALIZE_COMPLETE
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({
        status: 'FINALIZE_COMPLETE',
        last_commit_hash: 'some_hash',
      }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({
        prTitle: 'test pr',
        masterPlanPath: 'docs/plans/test.plan.md',
      }),
    );

    // Simulate submitting the updated plan
    await simulateAgentTurn('submit_work', ['"Updated plan content"'], testDir);

    // Verify state
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('PLAN_UPDATED');
  });

  it('should transition from PLAN_UPDATED to INITIALIZING and merge the branch', async () => {
    // Setup: Set state to PLAN_UPDATED
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'PLAN_UPDATED' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({ prTitle: 'test-pr' }),
    );
    await execAsync('git checkout -b feature/test-pr', { cwd: testDir });
    await execAsync('git commit --allow-empty -m "feat: test"', { cwd: testDir });


    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('INITIALIZING');

    expect(stdout).toContain('Branch merged and deleted');
  });

  it('should transition from PLAN_UPDATED to HALTED on merge conflict', async () => {
    // Setup: Set state to PLAN_UPDATED
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'PLAN_UPDATED' }),
    );
    await fs.writeFile(
      path.join(testDir, 'ACTIVE_PR.json'),
      JSON.stringify({ prTitle: 'test-pr' }),
    );
    await execAsync('git checkout -b feature/test-pr', { cwd: testDir });
    await execAsync('git commit --allow-empty -m "feat: test"', { cwd: testDir });

    await simulateAgentTurn('get_task', [], testDir);

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('HALTED');
  });

  it('should be a terminal state', async () => {
    // Setup: Set state to HALTED
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'HALTED' }),
    );

    // Try to trigger a state change
    await expect(simulateAgentTurn('get_task', [], testDir)).rejects.toThrow();

    // Verify state remains HALTED
    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, 'ORCHESTRATION_STATE.json'),
        'utf-8',
      ),
    );
    expect(state.status).toBe('HALTED');
  });

  it('should instruct to create a safety checkpoint after a green step', async () => {
    // Setup: Create an ACTIVE_PR.json with a completed GREEN step
    const activePRPath = path.join(testDir, 'ACTIVE_PR.json');
    const prContent = {
      tasks: [
        {
          name: 'task 1',
          status: 'TODO',
          tdd_steps: [
            { type: 'GREEN', description: 'Make test pass', status: 'DONE' },
            { type: 'REFACTOR', description: 'Refactor', status: 'TODO' },
          ],
        },
      ],
    };
    await fs.writeFile(activePRPath, JSON.stringify(prContent));
    await fs.writeFile(
      path.join(testDir, 'ORCHESTRATION_STATE.json'),
      JSON.stringify({ status: 'EXECUTING_TDD', last_completed_step: 'GREEN' }),
    );



    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    expect(stdout).toContain('git commit -am "TDD: GREEN - Make test pass"');
  });

});
