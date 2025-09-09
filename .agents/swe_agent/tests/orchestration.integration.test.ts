import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const BASE_DIR = path.resolve(__dirname, '..');
const TOOLS_DIR = path.resolve(BASE_DIR, 'tools');

async function simulateAgentTurn(
  tool: 'get_task' | 'submit_work',
  args: string[] = [],
  testDir: string
) {
  const command = `bash ${path.resolve(TOOLS_DIR, `${tool}.sh`)} ${args.join(
    ' '
  )}`;
  return await execAsync(command, { cwd: testDir });
}

describe('SWE Agent Orchestration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join('/tmp', 'swe-agent-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should transition from [NO_STATE] to INITIALIZING', async () => {
    const { stdout } = await simulateAgentTurn('get_task', [], testDir);

    // Verify output
    expect(stdout).toContain('Please read the plan file');

    // Verify state
    const state = JSON.parse(await fs.readFile(path.join(testDir, 'ORCHESTRATION_STATE.json'), 'utf-8'));
    expect(state.status).toBe('INITIALIZING');
  });

  it('should transition from INITIALIZING to CREATING_BRANCH', async () => {
    // Setup: Start in INITIALIZING state
    await fs.writeFile(path.join(testDir, 'ORCHESTRATION_STATE.json'), JSON.stringify({ status: 'INITIALIZING' }));
    await fs.writeFile(path.join(testDir, 'ACTIVE_PR.json'), JSON.stringify({ prTitle: 'test pr' }));

    const { stdout } = await simulateAgentTurn('submit_work', [], testDir);

    // Verify output
    expect(stdout).toContain('create a new branch');

    // Verify state
    const state = JSON.parse(await fs.readFile(path.join(testDir, 'ORCHESTRATION_STATE.json'), 'utf-8'));
    expect(state.status).toBe('CREATING_BRANCH');
  });
});
