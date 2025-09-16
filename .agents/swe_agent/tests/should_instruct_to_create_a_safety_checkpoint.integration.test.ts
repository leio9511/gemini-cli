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
  args: Record<string, any> = {},
  testDir: string,
  options: {
    env?: Record<string, string>;
  } = {},
) {
  const command = `bash ${path.resolve(TOOLS_DIR, 'run.sh')} ${tool}`;
  const jsonArgs = JSON.stringify(args);

  const env = {
    ...process.env,
    ...options.env,
    PATH: `${path.join(testDir, 'node_modules', '.bin')}:${process.env.PATH}`,
  };
  console.log(`Executing command: ${command}`);
  const result = await execAsync(`echo '${jsonArgs}' | ${command}`, { cwd: testDir, env: env, shell: '/bin/bash' });
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


    const { stdout } = await simulateAgentTurn('get_task', {}, testDir);

    expect(stdout).toContain('create a safety checkpoint commit');
  });
});
