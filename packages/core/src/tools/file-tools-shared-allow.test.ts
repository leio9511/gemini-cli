/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Config } from '../config/config.js';
import { IdeClient } from '../ide/ide-client.js';
import { WriteFileTool } from './write-file.js';
import { SafePatchTool } from './safe-patch.js';
import { ToolConfirmationOutcome } from './tools.js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as crypto from 'crypto';
import * as patchUtils from '../utils/patchUtils.js';

vi.mock('fs/promises');
vi.mock('fs');
vi.mock('crypto');
vi.mock('../utils/patchUtils');

describe('File Tools Shared Allowlist', () => {
  let config: Config;
  let writeFileTool: WriteFileTool;
  let safePatchTool: SafePatchTool;

  beforeEach(() => {
    const mockIdeClient = {
      setIdeClientDisconnected: vi.fn(),
      reconnect: vi.fn(),
    } as unknown as IdeClient;

    // Mock fs before creating Config
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fsSync.Stats);
    vi.mocked(fsSync.realpathSync).mockReturnValue('/test');

    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      ideClient: mockIdeClient,
      model: 'gemini-pro',
    });

    writeFileTool = new WriteFileTool(config);
    safePatchTool = new SafePatchTool(config);

    // Mock underlying file system checks to isolate confirmation logic
    vi.mocked(fs.readFile).mockResolvedValue('existing content');
    vi.mocked(crypto.createHash).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('matching-hash'),
    } as unknown as crypto.Hash);
    vi.mocked(patchUtils.applyFuzzyPatch).mockReturnValue('new content');
  });

  it('should share the "always allow" setting between write_file and safe_patch', async () => {
    // 1. Confirm write_file needs confirmation
    const writeConfirmation = await writeFileTool.shouldConfirmExecute({
      file_path: '/test/foo.txt',
      content: 'new content',
      base_content_sha256: 'matching-hash',
    });
    expect(writeConfirmation).not.toBe(false);

    // 2. User selects "Always Allow" for write_file
    if (typeof writeConfirmation === 'object' && writeConfirmation.onConfirm) {
      await writeConfirmation.onConfirm(ToolConfirmationOutcome.ProceedAlways);
    }

    // 3. Verify write_file no longer needs confirmation
    const writeConfirmationAfter = await writeFileTool.shouldConfirmExecute({
      file_path: '/test/foo.txt',
      content: 'new content',
      base_content_sha256: 'matching-hash',
    });
    expect(writeConfirmationAfter).toBe(false);

    // 4. Verify safe_patch also no longer needs confirmation
    const patchConfirmation = await safePatchTool.shouldConfirmExecute({
      file_path: '/test/foo.txt',
      unified_diff: 'a-diff',
      base_content_sha256: 'matching-hash',
    });
    expect(patchConfirmation).toBe(false);
  });
});
