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

const BASE_DIR = path.resolve(__dirname, '..', '..');
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
});
