/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
} from 'vitest';
import { SafePatchTool, type SafePatchToolParams } from './safe-patch';
import { SessionStateService } from '../services/session-state-service';
import { type Config } from '../config/config';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext';
import * as fileUtils from '../utils/fileUtils';
import * as patchUtils from '../utils/patchUtils';
import { InvalidDiffError } from '../errors.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('crypto');
vi.mock('../utils/patchUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof patchUtils>();
  return {
    ...actual,
    applyFuzzyPatch: vi.fn(),
  };
});
vi.mock('../utils/fileUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof fileUtils>();
  return {
    ...actual,
    createVersionedFileObject: vi.fn(),
  };
});

interface PatchResult {
  success: boolean;
  message: string;
  latest_file_state: {
    sha256: string;
  };
}

describe('SafePatchTool', () => {
  let tempRootDir: string;
  let tool: SafePatchTool;
  let mockSessionStateService: SessionStateService;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  // Mocked functions
  const mockedFs = fs as Mocked<typeof fs>;
  const mockedCrypto = crypto as Mocked<typeof crypto>;
  const mockedPatchUtils = patchUtils as Mocked<typeof patchUtils>;
  const mockedCreateVersionedFileObject = vi.mocked(
    fileUtils.createVersionedFileObject,
  );

  beforeEach(async () => {
    mockedFs.mkdtemp.mockResolvedValue('/tmp/safe-patch-test-');
    tempRootDir = await fs.mkdtemp('safe-patch-test-');

    mockSessionStateService = new SessionStateService();
    vi.spyOn(mockSessionStateService, 'getNextVersion').mockReturnValue(2);

    mockConfig = {
      getProjectRoot: () => tempRootDir,
      getSessionStateService: () => mockSessionStateService,
      getFileService: () => ({
        findFiles: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
      }),
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
      getLogSafePatchFailureFolder: () => undefined,
      isToolGroupAlwaysAllowed: vi.fn(),
      setToolGroupAlwaysAllowed: vi.fn(),
    } as unknown as Config;

    tool = new SafePatchTool(mockConfig);

    // Setup mock for crypto
    const mockHash = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(),
    } as unknown as crypto.Hash;
    mockedCrypto.createHash.mockReturnValue(mockHash);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const setupMocks = ({
    filePath,
    originalContent,
    baseHash,
    newContent,
    newHash,
  }: {
    filePath: string;
    originalContent: string;
    baseHash: string;
    newContent?: string;
    newHash?: string;
  }) => {
    mockedFs.readFile.mockResolvedValue(originalContent);
    vi.mocked(mockedCrypto.createHash('sha256').digest).mockReturnValueOnce(
      baseHash,
    );
    if (newContent !== undefined && newHash !== undefined) {
      mockedPatchUtils.applyFuzzyPatch.mockReturnValue(newContent);
      mockedFs.writeFile.mockResolvedValue();
      mockedCreateVersionedFileObject.mockResolvedValue({
        file_path: filePath,
        version: 2,
        sha256: newHash,
        content: newContent,
      });
    }
  };

  it('should apply a patch with a corrected line number', async () => {
    const filePath = `${tempRootDir}/test.txt`;
    const originalContent = 'line 1\nline 2\nline 3\n';
    const unifiedDiff =
      '--- a/test.txt\n+++ b/test.txt\n@@ -1,3 +1,3 @@\n-line 1\n+line one\n line 2\n line 3\n';
    const newContent = 'line one\nline 2\nline 3\n';
    const baseHash = 'original-hash';
    const newHash = 'new-hash';

    setupMocks({
      filePath,
      originalContent,
      baseHash,
      newContent,
      newHash,
    });

    const params: SafePatchToolParams = {
      file_path: filePath,
      unified_diff: unifiedDiff,
      base_content_sha256: baseHash,
    };

    const result = await tool.execute(params, abortSignal);

    expect(result.returnDisplay).toEqual(
      expect.objectContaining({
        fileDiff: unifiedDiff,
      }),
    );
    const resultJson = result.llmContent as PatchResult;
    expect(resultJson.success).toBe(true);
    expect(resultJson.latest_file_state.sha256).toBe(newHash);
    expect(mockedPatchUtils.applyFuzzyPatch).toHaveBeenCalledWith(
      originalContent,
      unifiedDiff,
    );
  });

  it('should apply a simple valid patch without correction', async () => {
    const filePath = `${tempRootDir}/test.txt`;
    const originalContent = 'line 1\nline 2\nline 3\n';
    const unifiedDiff =
      '--- a/test.txt\n+++ b/test.txt\n@@ -1,3 +1,3 @@\n-line 1\n+line one\n line 2\n line 3\n';
    const newContent = 'line one\nline 2\nline 3\n';
    const baseHash = 'original-hash';
    const newHash = 'new-hash';

    setupMocks({
      filePath,
      originalContent,
      baseHash,
      newContent,
      newHash,
    });

    const params: SafePatchToolParams = {
      file_path: filePath,
      unified_diff: unifiedDiff,
      base_content_sha256: baseHash,
    };

    const result = await tool.execute(params, abortSignal);

    expect(result.returnDisplay).toEqual(
      expect.objectContaining({
        fileDiff: unifiedDiff,
      }),
    );
    const resultJson = result.llmContent as PatchResult;
    expect(resultJson.success).toBe(true);
    expect(resultJson.latest_file_state.sha256).toBe(newHash);
  });

  it('should fail if the base hash does not match', async () => {
    const filePath = `${tempRootDir}/test.txt`;
    const originalContent = 'line 1\n';
    const baseHash = 'correct-hash';
    const wrongHash = 'wrong-hash';

    mockedFs.readFile.mockResolvedValue(originalContent);
    vi.mocked(mockedCrypto.createHash('sha256').digest).mockReturnValueOnce(
      baseHash,
    );
    mockedCreateVersionedFileObject.mockResolvedValue({
      file_path: filePath,
      version: 1,
      sha256: baseHash,
      content: originalContent,
    });

    const params: SafePatchToolParams = {
      file_path: filePath,
      unified_diff: 'any diff',
      base_content_sha256: wrongHash,
    };

    const result = await tool.execute(params, abortSignal);

    expect(result.returnDisplay).toBe('State Mismatch');
    const resultJson = result.llmContent as PatchResult;
    expect(resultJson.success).toBe(false);
    expect(resultJson.message).toContain('State Mismatch');
  });

  it('should fail if the diff content is invalid', async () => {
    const filePath = `${tempRootDir}/test.txt`;
    const originalContent = 'line 1\n';
    const unifiedDiff =
      '--- a/test.txt\n+++ b/test.txt\n@@ -1,1 +1,1 @@\n-non-existent line\n+new line\n';
    const baseHash = 'original-hash';

    setupMocks({ filePath, originalContent, baseHash });
    mockedPatchUtils.applyFuzzyPatch.mockImplementation(() => {
      throw new InvalidDiffError('Invalid Diff');
    });

    const params: SafePatchToolParams = {
      file_path: filePath,
      unified_diff: unifiedDiff,
      base_content_sha256: baseHash,
    };

    const result = await tool.execute(params, abortSignal);

    expect(result.returnDisplay).toBe('Invalid Diff');
    const resultJson = result.llmContent as PatchResult;
    expect(resultJson.success).toBe(false);
    expect(resultJson.message).toContain('Invalid Diff');
  });

  it('should not return latest_file_state when diff is invalid', async () => {
    const filePath = `${tempRootDir}/test.txt`;
    const originalContent = 'line 1\n';
    const unifiedDiff = 'invalid diff';
    const baseHash = 'original-hash';

    setupMocks({ filePath, originalContent, baseHash });
    mockedPatchUtils.applyFuzzyPatch.mockImplementation(() => {
      throw new InvalidDiffError('Invalid Diff');
    });
    // This mock is for the failing case that we want to remove
    mockedCreateVersionedFileObject.mockResolvedValue({
      file_path: filePath,
      version: 1,
      sha256: baseHash,
      content: originalContent,
    });

    const params: SafePatchToolParams = {
      file_path: filePath,
      unified_diff: unifiedDiff,
      base_content_sha256: baseHash,
    };

    const result = await tool.execute(params, abortSignal);

    const resultJson = result.llmContent as PatchResult;
    expect(resultJson.success).toBe(false);
    expect(resultJson.message).toContain('Invalid Diff');
    expect(resultJson).not.toHaveProperty('latest_file_state');
  });

  it('should log failed patches if logSafePatchFailureFolder is set', async () => {
    const failureFolder = `${tempRootDir}/failures`;
    vi.spyOn(mockConfig, 'getLogSafePatchFailureFolder').mockReturnValue(
      failureFolder,
    );
    const filePath = `${tempRootDir}/test.txt`;
    const originalContent = 'line 1\n';
    const unifiedDiff = 'invalid diff';
    const baseHash = 'original-hash';

    setupMocks({ filePath, originalContent, baseHash });
    mockedPatchUtils.applyFuzzyPatch.mockImplementation(() => {
      throw new InvalidDiffError('Invalid Diff');
    });

    const params: SafePatchToolParams = {
      file_path: filePath,
      unified_diff: unifiedDiff,
      base_content_sha256: baseHash,
    };

    await tool.execute(params, abortSignal);

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(
        /source_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.txt$/,
      ),
      originalContent,
    );
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(
        /diff_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.txt$/,
      ),
      unifiedDiff,
    );
  });

  it('should create a new file if it does not exist', async () => {
    const filePath = `${tempRootDir}/new_file.txt`;
    const unifiedDiff =
      '--- /dev/null\n+++ b/new_file.txt\n@@ -0,0 +1,1 @@\n+new line\n';
    const newContent = 'new line\n';
    const baseHash =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // empty string
    const newHash = 'new-hash';

    mockedFs.readFile.mockRejectedValue({ code: 'ENOENT' });
    vi.mocked(mockedCrypto.createHash('sha256').digest).mockReturnValueOnce(
      baseHash,
    );
    mockedPatchUtils.applyFuzzyPatch.mockReturnValue(newContent);
    mockedFs.writeFile.mockResolvedValue();
    mockedCreateVersionedFileObject.mockResolvedValue({
      file_path: filePath,
      version: 2,
      sha256: newHash,
      content: newContent,
    });

    const params: SafePatchToolParams = {
      file_path: filePath,
      unified_diff: unifiedDiff,
      base_content_sha256: baseHash,
    };

    const result = await tool.execute(params, abortSignal);

    expect(result.returnDisplay).toEqual(
      expect.objectContaining({
        fileDiff: unifiedDiff,
      }),
    );
    const resultJson = result.llmContent as PatchResult;
    expect(resultJson.success).toBe(true);
  });

  describe('shouldConfirmExecute', () => {
    it('should return false if the hash check fails', async () => {
      const filePath = `${tempRootDir}/test.txt`;
      const originalContent = 'line 1\n';
      const baseHash = 'correct-hash';
      const wrongHash = 'wrong-hash';

      mockedFs.readFile.mockResolvedValue(originalContent);
      vi.mocked(mockedCrypto.createHash('sha256').digest).mockReturnValueOnce(
        baseHash,
      );

      const params: SafePatchToolParams = {
        file_path: filePath,
        unified_diff: 'any diff',
        base_content_sha256: wrongHash,
      };

      const confirmation = await tool.shouldConfirmExecute(params);
      expect(confirmation).toBe(false);
    });

    it('should return confirmation details if the hash check passes', async () => {
      const filePath = `${tempRootDir}/test.txt`;
      const originalContent = 'line 1\n';
      const unifiedDiff =
        '--- a/test.txt\n+++ b/test.txt\n@@ -1,1 +1,1 @@\n-line 1\n+line one\n';
      const baseHash = 'original-hash';

      setupMocks({ filePath, originalContent, baseHash });
      mockedPatchUtils.applyFuzzyPatch.mockReturnValue('line one\n');

      const params: SafePatchToolParams = {
        file_path: filePath,
        unified_diff: unifiedDiff,
        base_content_sha256: baseHash,
      };

      const confirmation = (await tool.shouldConfirmExecute(
        params,
        abortSignal,
      )) as import('./tools.js').ToolEditConfirmationDetails;

      expect(confirmation.type).toBe('edit');
      expect(confirmation.fileName).toBe(filePath);
      expect(confirmation.fileDiff).toBe(unifiedDiff);
    });
  });
});
