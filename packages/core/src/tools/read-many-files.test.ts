/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReadManyFilesTool } from './read-many-files.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import path from 'path';
import fs from 'fs'; // Actual fs for setup
import os from 'os';
import { Config } from '../config/config.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import * as fileUtils from '../utils/fileUtils.js';
import { SessionStateService } from '../services/session-state-service.js';
import { VersionedFile } from '../utils/fileUtils.js';

// Mock the fileUtils module to isolate the tool's orchestration logic
vi.mock('../utils/fileUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof fileUtils>();
  return {
    ...actual,
    // Keep other utils, but mock the one we are testing against
    createVersionedFileObject: vi.fn(),
  };
});

vi.mock('mime-types', () => {
  const lookup = (filename: string) => {
    if (filename.endsWith('.ts') || filename.endsWith('.js')) {
      return 'text/plain';
    }
    if (filename.endsWith('.png')) {
      return 'image/png';
    }
    if (filename.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (filename.endsWith('.mp3') || filename.endsWith('.wav')) {
      return 'audio/mpeg';
    }
    if (filename.endsWith('.mp4') || filename.endsWith('.mov')) {
      return 'video/mp4';
    }
    return false;
  };
  return {
    default: {
      lookup,
    },
    lookup,
  };
});

describe('ReadManyFilesTool', () => {
  let tool: ReadManyFilesTool;
  let tempRootDir: string;
  let sessionStateService: SessionStateService;
  let mockCreateVersionedFileObject: vi.Mock;

  beforeEach(async () => {
    tempRootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'read-many-files-root-')),
    );
    fs.writeFileSync(
      path.join(tempRootDir, '.geminiignore'),
      'ignored-file.txt',
    );

    sessionStateService = new SessionStateService();
    const fileService = new FileDiscoveryService(tempRootDir);

    const mockConfig = {
      getFileService: () => fileService,
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => new WorkspaceContext(tempRootDir),
      getSessionStateService: () => sessionStateService,
    } as Partial<Config> as Config;

    tool = new ReadManyFilesTool(mockConfig);

    // Get a reference to the mock function
    mockCreateVersionedFileObject = vi.mocked(
      fileUtils.createVersionedFileObject,
    );
    mockCreateVersionedFileObject.mockClear();
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('validateParams', () => {
    it('should return null for valid relative paths within root', () => {
      const params = { paths: ['file1.txt', 'subdir/file2.txt'] };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('should return null for valid glob patterns within root', () => {
      const params = { paths: ['*.txt', 'subdir/**/*.js'] };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('should return null for paths trying to escape the root (e.g., ../) as execute handles this', () => {
      const params = { paths: ['../outside.txt'] };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('should return error if paths array is empty', () => {
      const params = { paths: [] };
      expect(tool.validateParams(params)).toBe(
        'params/paths must NOT have fewer than 1 items',
      );
    });

    it('should return null for valid exclude and include patterns', () => {
      const params = {
        paths: ['src/**/*.ts'],
        exclude: ['**/*.test.ts'],
        include: ['src/utils/*.ts'],
      };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('should return error if paths array contains an empty string', () => {
      const params = { paths: ['file1.txt', ''] };
      expect(tool.validateParams(params)).toBe(
        'params/paths/1 must NOT have fewer than 1 characters',
      );
    });

    it('should return error if include array contains non-string elements', () => {
      const params = {
        paths: ['file1.txt'],
        include: ['*.ts', 123] as string[],
      };
      expect(tool.validateParams(params)).toBe(
        'params/include/1 must be string',
      );
    });

    it('should return error if exclude array contains non-string elements', () => {
      const params = {
        paths: ['file1.txt'],
        exclude: ['*.log', {}] as string[],
      };
      expect(tool.validateParams(params)).toBe(
        'params/exclude/1 must be string',
      );
    });
  });

  describe('execute', () => {
    const createFile = (filePath: string, content = '') => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    };

    it('should handle glob patterns and call the utility for each match', async () => {
      createFile('file.txt', 'Text file');
      createFile('another.txt', 'Another text');
      createFile('sub/data.json', '{}'); // Should not be matched by glob

      const mockFile1 = {
        file_path: path.join(tempRootDir, 'file.txt'),
        version: 1,
        sha256: 'abc',
        content: 'Text file',
      };
      const mockFile2 = {
        file_path: path.join(tempRootDir, 'another.txt'),
        version: 2,
        sha256: 'def',
        content: 'Another text',
      };

      mockCreateVersionedFileObject.mockImplementation(
        async (filePath: string) => {
          if (filePath.endsWith('file.txt')) return mockFile1;
          if (filePath.endsWith('another.txt')) return mockFile2;
          return null;
        },
      );

      const params = { paths: ['*.txt'] };
      const result = await tool.execute(params, new AbortController().signal);

      const sortedLlmContent = (
        JSON.parse(result.llmContent as string) as VersionedFile[]
      ).sort((a, b) => a.file_path.localeCompare(b.file_path));
      const sortedMockContent = [mockFile1, mockFile2].sort((a, b) =>
        a.file_path.localeCompare(b.file_path),
      );
      expect(sortedLlmContent).toEqual(sortedMockContent);
      expect(result.returnDisplay).toContain(
        'Successfully read and processed **2 file(s)**.',
      );
    });

    it('should respect exclude patterns and not call utility for excluded files', async () => {
      createFile('src/main.ts', 'Main content');
      createFile('src/main.test.ts', 'Test content');

      const mockFile = {
        file_path: path.join(tempRootDir, 'src/main.ts'),
        version: 1,
        sha256: 'abc',
        content: 'Main content',
      };
      mockCreateVersionedFileObject.mockResolvedValue(mockFile);

      const params = { paths: ['src/**/*.ts'], exclude: ['**/*.test.ts'] };
      const result = await tool.execute(params, new AbortController().signal);

      expect(mockCreateVersionedFileObject).toHaveBeenCalledTimes(1);
      expect(mockCreateVersionedFileObject).toHaveBeenCalledWith(
        path.join(tempRootDir, 'src/main.ts'),
        sessionStateService,
      );
      expect(JSON.parse(result.llmContent as string)).toEqual([mockFile]);
    });

    it('should return a message when no files are found', async () => {
      const params = { paths: ['nonexistent-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);

      expect(mockCreateVersionedFileObject).not.toHaveBeenCalled();
      expect(result.llmContent).toEqual(
        'No files matching the criteria were found or all were skipped.',
      );
      expect(result.returnDisplay).toContain(
        'No files were read and processed based on the criteria.',
      );
    });

    it('should skip files that fail processing in the utility', async () => {
      createFile('good.txt', 'Good content');
      createFile('bad.txt', 'Bad content');

      const mockGoodFile = {
        file_path: path.join(tempRootDir, 'good.txt'),
        version: 1,
        sha256: 'abc',
        content: 'Good content',
      };
      mockCreateVersionedFileObject.mockImplementation(
        async (filePath: string) => {
          if (filePath.endsWith('good.txt')) {
            return mockGoodFile;
          }
          if (filePath.endsWith('bad.txt')) {
            // Simulate a read error by throwing
            throw new Error('Read error');
          }
          return null;
        },
      );

      const params = { paths: ['*.txt'] };
      const result = await tool.execute(params, new AbortController().signal);

      expect(mockCreateVersionedFileObject).toHaveBeenCalledTimes(2);
      expect(JSON.parse(result.llmContent as string)).toEqual([mockGoodFile]);
      expect(result.returnDisplay).toContain(
        'Successfully read and processed **1 file(s)**',
      );
      expect(result.returnDisplay).toContain('**Skipped 1 item(s):**');
      expect(result.returnDisplay).toContain('- bad.txt (Reason: Read error)');
    });
  });
});
