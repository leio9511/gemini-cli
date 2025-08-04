/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTool,
  ToolResult,
  Icon,
  ToolCallConfirmationDetails,
} from './tools.js';
import { Config } from '../config/config.js';
import { SessionStateService } from '../services/session-state-service.js';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { createVersionedFileObjectFromContent } from '../utils/fileUtils.js';
import { Schema, Type } from '@google/genai';
import { correctDiff, InvalidDiffError } from '../utils/patchUtils.js';
import * as diff from 'diff';

export interface SafePatchToolParams {
  file_path: string;
  unified_diff: string;
  base_content_sha256: string;
}

export class SafePatchTool extends BaseTool<SafePatchToolParams, ToolResult> {
  private readonly sessionStateService: SessionStateService;
  static readonly Name = 'safe_patch';

  constructor(private readonly config: Config) {
    super(
      SafePatchTool.Name,
      'Safe Patch',
      `Applies a set of changes to a file using a unified diff patch. This is the preferred tool for all file modifications.

**Usage Protocol:**

1. To use this tool, you must operate on the latest version of the file available in your context. Identify this by finding the file content with the **highest version number**.
2. If no versioned content is available, you **MUST** call \`read_file\` or \`read_many_files\` first to get it.
3. When generating the \`unified_diff\`, you **MUST** include at least 10 lines of unchanged context around each change hunk (equivalent to \`diff -U 10\`) to ensure the patch can be applied reliably.
4. You **MUST** provide the \`sha256\` hash that was returned with that version as the \`base_content_sha256\` parameter. This hash acts as a lock; the operation will fail if the file has been modified since you read it.`,
      Icon.Pencil,
      {
        properties: {
          file_path: {
            description: 'The path to the file to patch.',
            type: Type.STRING,
          },
          unified_diff: {
            description: 'The unified diff to apply.',
            type: Type.STRING,
          },
          base_content_sha256: {
            description:
              'The SHA-256 hash of the file content that the diff applies to.',
            type: Type.STRING,
          },
        },
        required: ['file_path', 'unified_diff', 'base_content_sha256'],
        type: Type.OBJECT,
      } as Schema,
    );
    this.sessionStateService = config.getSessionStateService();
  }

  private async _createFailureResult(
    message: string,
    display: string,
    filePath: string,
    content: string,
  ): Promise<ToolResult> {
    const latestFileState = await createVersionedFileObjectFromContent(
      filePath,
      this.sessionStateService,
      content,
    );
    return {
      llmContent: JSON.stringify(
        {
          success: false,
          message,
          latest_file_state: latestFileState,
        },
        null,
        2,
      ),
      returnDisplay: display,
    };
  }

  private async _verifyFileState(
    filePath: string,
    expectedHash: string,
  ): Promise<{ content: string; errorResult?: ToolResult }> {
    let content = '';

    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
      // It's a new file, content is empty.
    }

    const actualHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    if (expectedHash !== actualHash) {
      return {
        content,
        errorResult: await this._createFailureResult(
          'State Mismatch: File has changed on disk since it was last read.',
          'State Mismatch',
          filePath,
          content,
        ),
      };
    }

    return { content };
  }

  private async _applyAndWritePatch(
    filePath: string,
    originalContent: string,
    correctedDiff: string,
  ): Promise<{ newContent: string; errorResult?: ToolResult }> {
    const newContent = diff.applyPatch(originalContent, correctedDiff, {
      fuzzFactor: 0,
    });

    if (newContent === false) {
      return {
        newContent: originalContent,
        errorResult: await this._createFailureResult(
          'Internal Error: The corrected patch failed to apply.',
          'Patch Failed',
          filePath,
          originalContent,
        ),
      };
    }

    await fs.writeFile(filePath, newContent);
    return { newContent };
  }

  async execute(
    params: SafePatchToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const { file_path, unified_diff, base_content_sha256 } = params;

    const { content: originalContent, errorResult: verificationError } =
      await this._verifyFileState(file_path, base_content_sha256);
    if (verificationError) {
      return verificationError;
    }

    let correctedDiffStr;
    try {
      correctedDiffStr = correctDiff(originalContent, unified_diff);
    } catch (e) {
      if (e instanceof InvalidDiffError) {
        return this._createFailureResult(
          e.message,
          'Invalid Diff',
          file_path,
          originalContent,
        );
      }
      throw e; // Re-throw unexpected errors
    }

    const { newContent, errorResult: applyError } =
      await this._applyAndWritePatch(
        file_path,
        originalContent,
        correctedDiffStr,
      );
    if (applyError) {
      return applyError;
    }

    const latestFileState = await createVersionedFileObjectFromContent(
      file_path,
      this.sessionStateService,
      newContent,
    );

    return {
      llmContent: JSON.stringify(
        {
          success: true,
          message: 'Patch applied successfully.',
          latest_file_state: latestFileState,
        },
        null,
        2,
      ),
      returnDisplay: 'Patch Applied',
    };
  }

  async shouldConfirmExecute(
    params: SafePatchToolParams,
    _abortSignal: AbortSignal,
  ): Promise<false | ToolCallConfirmationDetails> {
    const { file_path, unified_diff, base_content_sha256 } = params;
    const { content: originalContent, errorResult: verificationError } =
      await this._verifyFileState(file_path, base_content_sha256);

    if (verificationError) {
      return false;
    }

    const newContent = diff.applyPatch(originalContent, unified_diff, {
      fuzzFactor: 0,
    });

    if (newContent === false) {
      return false;
    }

    return {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: file_path,
      fileDiff: unified_diff,
      originalContent,
      newContent,
      onConfirm: async () => {},
    };
  }
}
