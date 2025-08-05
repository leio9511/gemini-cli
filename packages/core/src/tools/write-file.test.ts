/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { WriteFileTool } from './write-file.js';
import { Config } from '../config/config.js';
import { SessionStateService } from '../services/session-state-service.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import * as fileUtils from '../utils/fileUtils.js';
import { ToolEditConfirmationDetails } from './tools.js';

const rootDir = '/test/root';

vi.mock('fs/promises');
vi.mock('crypto');
vi.mock('../utils/fileUtils.js');

const mockFs = vi.mocked(fs);
const mockCrypto = vi.mocked(crypto);
const mockFileUtils = vi.mocked(fileUtils);

const mockConfig = {
  getWorkspaceContext: () => createMockWorkspaceContext(rootDir),
  getSessionStateService: vi.fn(),
} as unknown as Config;

const mockSessionStateService = {
  getNextVersion: vi.fn(),
} as unknown as Mocked<SessionStateService>;

describe('WriteFileTool (TDD)', () => {
  let tool: WriteFileTool;
  const mockHash = 'mocked-sha256-hash';
  const mockVersion = 42;

  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(mockConfig.getSessionStateService).mockReturnValue(
      mockSessionStateService,
    );
    vi.mocked(mockSessionStateService.getNextVersion).mockReturnValue(
      mockVersion,
    );

    const mockHashUpdate = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(mockHash),
    };
    mockCrypto.createHash.mockReturnValue(
      mockHashUpdate as unknown as crypto.Hash,
    );

    mockFileUtils.createVersionedFileObjectFromContent.mockImplementation(
      async (filePath, sessionState, content) => ({
        file_path: filePath,
        version: sessionState.getNextVersion(),
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        content,
      }),
    );

    tool = new WriteFileTool(mockConfig);
  });

  it('should create a new file and return the correct state', async () => {
    const filePath = `${rootDir}/new_file.txt`;
    const content = 'hello world';
    mockFs.access.mockRejectedValue({ code: 'ENOENT' });

    const result = await tool.execute({ file_path: filePath, content }, null!);

    expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, content);
    const resultObj = JSON.parse(result.llmContent as string);

    expect(resultObj.success).toBe(true);
    expect(resultObj.message).toContain('File created successfully');
    expect(resultObj.latest_file_state).toEqual({
      file_path: filePath,
      version: mockVersion,
      sha256: mockHash,
      content,
    });
    expect(result.returnDisplay).toEqual(
      expect.objectContaining({
        fileName: filePath,
      }),
    );
  });

  it('should overwrite an existing file with the correct hash', async () => {
    const filePath = `${rootDir}/existing_file.txt`;
    const oldContent = 'old content';
    const newContent = 'new content';
    const oldHash = 'old-hash';

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(oldContent);
    mockCrypto.createHash
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue(oldHash),
      } as unknown as crypto.Hash)
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue(mockHash),
      } as unknown as crypto.Hash);

    const result = await tool.execute(
      {
        file_path: filePath,
        content: newContent,
        base_content_sha256: oldHash,
      },
      null!,
    );

    expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, newContent);
    const resultObj = JSON.parse(result.llmContent as string);

    expect(resultObj.success).toBe(true);
    expect(resultObj.message).toContain('File overwritten successfully');
    expect(resultObj.latest_file_state).toEqual({
      file_path: filePath,
      version: mockVersion,
      sha256: mockHash,
      content: newContent,
    });
    expect(result.returnDisplay).toEqual(
      expect.objectContaining({
        fileName: filePath,
      }),
    );
  });

  it('should fail to overwrite if hash is missing', async () => {
    const filePath = `${rootDir}/existing_file.txt`;
    const newContent = 'new content';

    mockFs.access.mockResolvedValue(undefined);

    const result = await tool.execute(
      {
        file_path: filePath,
        content: newContent,
      },
      null!,
    );

    expect(mockFs.writeFile).not.toHaveBeenCalled();
    const resultObj = JSON.parse(result.llmContent as string);
    expect(resultObj.success).toBe(false);
  });

  it('should fail to overwrite if hash mismatches', async () => {
    const filePath = `${rootDir}/existing_file.txt`;
    const oldContent = 'old content';
    const newContent = 'new content';
    const oldHash = 'old-hash';
    const wrongHash = 'wrong-hash';

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(oldContent);
    mockCrypto.createHash.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(oldHash),
    } as unknown as crypto.Hash);

    const result = await tool.execute(
      {
        file_path: filePath,
        content: newContent,
        base_content_sha256: wrongHash,
      },
      null!,
    );

    expect(mockFs.writeFile).not.toHaveBeenCalled();
    const resultObj = JSON.parse(result.llmContent as string);
    expect(resultObj.success).toBe(false);
  });

  describe('shouldConfirmExecute', () => {
    it('should return false if the hash check fails', async () => {
      const filePath = `${rootDir}/existing_file.txt`;
      const oldContent = 'old content';
      const newContent = 'new content';
      const oldHash = 'old-hash';
      const wrongHash = 'wrong-hash';

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(oldContent);
      mockCrypto.createHash.mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue(oldHash),
      } as unknown as crypto.Hash);

      const confirmation = await tool.shouldConfirmExecute({
        file_path: filePath,
        content: newContent,
        base_content_sha256: wrongHash,
      });

      expect(confirmation).toBe(false);
    });

    it('should return confirmation details if the hash check passes', async () => {
      const filePath = `${rootDir}/existing_file.txt`;
      const oldContent = 'old content';
      const newContent = 'new content';
      const oldHash = 'old-hash';

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(oldContent);
      mockCrypto.createHash.mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue(oldHash),
      } as unknown as crypto.Hash);

      const confirmation = (await tool.shouldConfirmExecute({
        file_path: filePath,
        content: newContent,
        base_content_sha256: oldHash,
      })) as ToolEditConfirmationDetails;

      expect(confirmation.type).toBe('edit');
      expect(confirmation.fileName).toBe(filePath);
      expect(confirmation.originalContent).toBe(oldContent);
      expect(confirmation.newContent).toBe(newContent);
      expect(confirmation.fileDiff).toBeDefined();
    });

    it('should return confirmation details for a new file', async () => {
      const filePath = `${rootDir}/new_file.txt`;
      const newContent = 'new content';

      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const confirmation = (await tool.shouldConfirmExecute({
        file_path: filePath,
        content: newContent,
      })) as ToolEditConfirmationDetails;

      expect(confirmation.type).toBe('edit');
      expect(confirmation.fileName).toBe(filePath);
    });
  });
});
