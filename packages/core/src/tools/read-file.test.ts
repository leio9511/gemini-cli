/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadFileTool, ReadFileToolParams } from './read-file.js';
import * as fileUtils from '../utils/fileUtils.js';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsp from 'fs/promises';
import { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { SessionStateService } from '../services/session-state-service.js';

// Mock the fileUtils module to test orchestration instead of implementation
vi.mock('../utils/fileUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof fileUtils>();
  return {
    ...actual,
    createVersionedFileObject: vi.fn(),
    processSingleFileContent: vi.fn(),
  };
});

describe('ReadFileTool', () => {
  let tempRootDir: string;
  let tool: ReadFileTool;
  let mockSessionStateService: SessionStateService;
  const abortSignal = new AbortController().signal;

  const mockedCreateVersionedFileObject = vi.mocked(
    fileUtils.createVersionedFileObject,
  );
  const mockedProcessSingleFileContent = vi.mocked(
    fileUtils.processSingleFileContent,
  );

  beforeEach(async () => {
    vi.resetAllMocks();

    tempRootDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'read-file-tool-root-'),
    );

    mockSessionStateService = new SessionStateService();

    const mockConfigInstance = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
      getSessionStateService: () => mockSessionStateService,
    } as unknown as Config;

    tool = new ReadFileTool(mockConfigInstance);
  });

  afterEach(async () => {
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  // Validation logic is still part of the tool itself.
  describe('validateToolParams', () => {
    it('should return null for valid params (absolute path within root)', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: ReadFileToolParams = { absolute_path: 'test.txt' };
      expect(tool.validateToolParams(params)).toBe(
        `File path must be absolute, but was relative: test.txt. You must provide an absolute path.`,
      );
    });

    it('should return error for path outside root', () => {
      const outsidePath = path.resolve(os.tmpdir(), 'outside-root.txt');
      const params: ReadFileToolParams = { absolute_path: outsidePath };
      const error = tool.validateToolParams(params);
      expect(error).toContain(
        'File path must be within one of the workspace directories',
      );
    });

    it('should return error if path is ignored by a .geminiignore pattern', async () => {
      await fsp.writeFile(
        path.join(tempRootDir, '.geminiignore'),
        'ignored.txt',
      );
      const ignoredFilePath = path.join(tempRootDir, 'ignored.txt');
      const params: ReadFileToolParams = {
        absolute_path: ignoredFilePath,
      };
      expect(tool.validateToolParams(params)).toContain(
        'is ignored by .geminiignore pattern(s)',
      );
    });
  });

  describe('getDescription', () => {
    it('should return a shortened, relative path', () => {
      const filePath = path.join(tempRootDir, 'sub', 'dir', 'file.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      expect(tool.getDescription(params)).toBe(
        path.join('sub', 'dir', 'file.txt'),
      );
    });
  });

  describe('execute', () => {
    it('should return validation error if params are invalid', async () => {
      const params: ReadFileToolParams = {
        absolute_path: 'relative/path.txt',
      };
      expect(await tool.execute(params, abortSignal)).toEqual({
        llmContent:
          'Error: Invalid parameters provided. Reason: File path must be absolute, but was relative: relative/path.txt. You must provide an absolute path.',
        returnDisplay:
          'File path must be absolute, but was relative: relative/path.txt. You must provide an absolute path.',
      });
      expect(mockedProcessSingleFileContent).not.toHaveBeenCalled();
    });

    it('should call processSingleFileContent and createVersionedFileObject for text files', async () => {
      const filePath = path.join(tempRootDir, 'textfile.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const fileContent = 'This is a test file.';
      const mockVersionedFile = {
        file_path: filePath,
        version: 1,
        sha256: 'hash123',
        content: fileContent,
      };

      mockedProcessSingleFileContent.mockResolvedValue({
        llmContent: fileContent,
        returnDisplay: 'Read text file.',
      });
      mockedCreateVersionedFileObject.mockResolvedValue(mockVersionedFile);

      const result = await tool.execute(params, abortSignal);

      expect(mockedProcessSingleFileContent).toHaveBeenCalledTimes(1);
      expect(mockedProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        undefined,
        undefined,
      );

      expect(mockedCreateVersionedFileObject).toHaveBeenCalledTimes(1);
      expect(mockedCreateVersionedFileObject).toHaveBeenCalledWith(
        filePath,
        mockSessionStateService,
      );

      expect(result).toEqual({
        llmContent: JSON.stringify(mockVersionedFile, null, 2),
        returnDisplay: `Read and versioned ${filePath}`,
      });
    });

    it('should return non-text content directly without versioning', async () => {
      const filePath = path.join(tempRootDir, 'image.png');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const imagePart = {
        inlineData: { mimeType: 'image/png', data: 'base64data' },
      };

      mockedProcessSingleFileContent.mockResolvedValue({
        llmContent: imagePart,
        returnDisplay: 'Read image file.',
      });

      const result = await tool.execute(params, abortSignal);

      expect(mockedProcessSingleFileContent).toHaveBeenCalledTimes(1);
      expect(mockedCreateVersionedFileObject).not.toHaveBeenCalled();
      expect(result).toEqual({
        llmContent: imagePart,
        returnDisplay: 'Read image file.',
      });
    });

    it('should handle errors from processSingleFileContent gracefully', async () => {
      const filePath = path.join(tempRootDir, 'nonexistent.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const errorMessage = `File not found: ${filePath}`;

      mockedProcessSingleFileContent.mockResolvedValue({
        error: errorMessage,
        llmContent: '',
        returnDisplay: 'File not found.',
      });

      const result = await tool.execute(params, abortSignal);

      expect(mockedProcessSingleFileContent).toHaveBeenCalledTimes(1);
      expect(mockedCreateVersionedFileObject).not.toHaveBeenCalled();
      expect(result).toEqual({
        llmContent: errorMessage,
        returnDisplay: 'File not found.',
      });
    });
  });
});
