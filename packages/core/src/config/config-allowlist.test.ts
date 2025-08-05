/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { Config } from './config.js';
import { IdeClient } from '../ide/ide-client.js';
import * as fs from 'fs';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    realpathSync: vi.fn(),
  };
});

describe('Config allowlist', () => {
  it('should manage tool group allowlist correctly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    vi.mocked(fs.realpathSync).mockReturnValue('/test');
    const mockIdeClient = {
      setIdeClientDisconnected: vi.fn(),
      reconnect: vi.fn(),
    } as unknown as IdeClient;

    const config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      ideClient: mockIdeClient,
      model: 'gemini-pro',
    });

    const toolGroup = 'file_modification';

    // Should be false initially
    expect(config.isToolGroupAlwaysAllowed(toolGroup)).toBe(false);

    // Set to true
    config.setToolGroupAlwaysAllowed(toolGroup);

    // Should now be true
    expect(config.isToolGroupAlwaysAllowed(toolGroup)).toBe(true);

    // Should be false for a different group
    expect(config.isToolGroupAlwaysAllowed('another_group')).toBe(false);
  });
});
