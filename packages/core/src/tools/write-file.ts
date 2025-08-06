/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as Diff from 'diff';
import * as crypto from 'crypto';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  Icon,
  ToolCallConfirmationDetails,
  ToolResultDisplay,
  ToolConfirmationOutcome,
} from './tools.js';
import { Schema, Type } from '@google/genai';
import { SessionStateService } from '../services/session-state-service.js';
import { createVersionedFileObject } from '../utils/fileUtils.js';
import { getErrorMessage } from '../utils/errors.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';

export interface WriteFileToolParams {
  file_path: string;
  content: string;
  base_content_sha256?: string;
}

export class WriteFileTool extends BaseTool<WriteFileToolParams, ToolResult> {
  static readonly Name: string = 'write_file';
  private readonly sessionStateService: SessionStateService;

  constructor(private readonly config: Config) {
    super(
      WriteFileTool.Name,
      'Write File',
      `Writes content to a file. This tool is for creating new files or completely overwriting existing ones.

**Usage Protocol:**

1.  **To create a new file:** Call the tool with the desired file_path and content. Do not provide a base_content_sha256.
2.  **To overwrite an existing file:** You **MUST** first have the latest versioned content of the file (from read_file or a previous tool call). You **MUST** provide the sha256 from that version as the base_content_sha256. This prevents accidental overwrites of files that have changed.
3.  If you attempt to write to an existing file path without providing a base_content_sha256, the operation will fail as a safety measure.`,
      Icon.Pencil,
      {
        properties: {
          file_path: { type: Type.STRING },
          content: { type: Type.STRING },
          base_content_sha256: { type: Type.STRING },
        },
        required: ['file_path', 'content'],
        type: Type.OBJECT,
      } as Schema,
    );
    this.sessionStateService = config.getSessionStateService();
  }

  validateToolParams(params: WriteFileToolParams): string | null {
    const filePath = params.file_path;
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute: ${filePath}`;
    }
    return null;
  }

  getDescription(params: WriteFileToolParams): string {
    return `Writing to ${params.file_path}`;
  }

  async execute(
    params: WriteFileToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const { file_path, content, base_content_sha256 } = params;
    let onDiskContent = '';
    let fileExists = false;
    try {
      await fs.access(file_path);
      fileExists = true;
    } catch (_e) {
      // file doesn't exist
    }

    if (fileExists) {
      if (!base_content_sha256) {
        return {
          llmContent: {
            success: false,
            message: 'File exists, but no hash was provided.',
          },
          returnDisplay: 'Error: File exists, but no hash was provided.',
        };
      }
      onDiskContent = await fs.readFile(file_path, 'utf-8');
      const actualHash = crypto
        .createHash('sha256')
        .update(onDiskContent)
        .digest('hex');
      if (actualHash !== base_content_sha256) {
        return {
          llmContent: {
            success: false,
            message: 'File content has changed since last read.',
          },
          returnDisplay: 'Error: File content has changed since last read.',
        };
      }
    }

    try {
      await fs.writeFile(file_path, content);
      const latestFileState = await createVersionedFileObject(
        file_path,
        content,
        this.sessionStateService,
      );
      return {
        llmContent: {
          success: true,
          message: fileExists
            ? 'File overwritten successfully.'
            : 'File created successfully.',
          latest_file_state: latestFileState,
        },
        returnDisplay: {
          type: 'edit',
          fileName: file_path,
          fileDiff: Diff.createPatch(file_path, onDiskContent, content),
          originalContent: onDiskContent,
          newContent: content,
        } as ToolResultDisplay,
      };
    } catch (e) {
      return {
        llmContent: {
          success: false,
          message: getErrorMessage(e),
        },
        returnDisplay: `Error: ${getErrorMessage(e)}`,
      };
    }
  }

  async shouldConfirmExecute(
    params: WriteFileToolParams,
  ): Promise<false | ToolCallConfirmationDetails> {
    if (this.config.isToolGroupAlwaysAllowed('file_modification')) {
      return false;
    }

    const { file_path, content, base_content_sha256 } = params;
    let onDiskContent = '';
    let fileExists = false;
    try {
      onDiskContent = await fs.readFile(file_path, 'utf-8');
      fileExists = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }

    if (fileExists) {
      if (!base_content_sha256) {
        // This should be caught by execute, but as a safeguard:
        return false;
      }
      const actualHash = crypto
        .createHash('sha256')
        .update(onDiskContent)
        .digest('hex');
      if (actualHash !== base_content_sha256) {
        return false;
      }
    }

    const fileDiff = Diff.createPatch(
      file_path,
      onDiskContent,
      content,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    return {
      type: 'edit',
      title: 'Confirm File Write',
      fileName: file_path,
      fileDiff,
      originalContent: onDiskContent,
      newContent: content,
      onConfirm: async (outcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setToolGroupAlwaysAllowed('file_modification');
        }
      },
    };
  }
}
