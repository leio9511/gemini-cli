/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import * as path from 'path';
import { glob } from 'glob';
import { getCurrentGeminiMdFilename } from './memoryTool.js';
import {
  createVersionedFileObject,
  getSpecificMimeType,
  processSingleFileContent,
  VersionedFile,
} from '../utils/fileUtils.js';
import { Part, Schema, Type } from '@google/genai';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * Parameters for the ReadManyFilesTool.
 */
export interface ReadManyFilesParams {
  /**
   * An array of file paths or directory paths to search within.
   * Paths are relative to the tool's configured target directory.
   * Glob patterns can be used directly in these paths.
   */
  paths: string[];

  /**
   * Optional. Glob patterns for files to include.
   * These are effectively combined with the `paths`.
   */
  include?: string[];

  /**
   * Optional. Glob patterns for files/directories to exclude.
   * Applied as ignore patterns.
   */
  exclude?: string[];

  /**
   * Optional. Search directories recursively.
   * This is generally controlled by glob patterns (e.g., `**`).
   * The glob implementation is recursive by default for `**`.
   * For simplicity, we'll rely on `**` for recursion.
   */
  recursive?: boolean;

  /**
   * Optional. Apply default exclusion patterns. Defaults to true.
   */
  useDefaultExcludes?: boolean;

  /**
   * Whether to respect .gitignore and .geminiignore patterns (optional, defaults to true)
   */
  file_filtering_options?: {
    respect_git_ignore?: boolean;
    respect_gemini_ignore?: boolean;
  };
}

/**
 * Default exclusion patterns for commonly ignored directories and binary file types.
 * These are compatible with glob ignore patterns.
 * TODO(adh): Consider making this configurable or extendable through a command line argument.
 * TODO(adh): Look into sharing this list with the glob tool.
 */
const DEFAULT_EXCLUDES: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.pyo',
  '**/*.bin',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.class',
  '**/*.jar',
  '**/*.war',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.bz2',
  '**/*.rar',
  '**/*.7z',
  '**/*.doc',
  '**/*.docx',
  '**/*.xls',
  '**/*.xlsx',
  '**/*.ppt',
  '**/*.pptx',
  '**/*.odt',
  '**/*.ods',
  '**/*.odp',
  '**/*.DS_Store',
  '**/.env',
  `**/${getCurrentGeminiMdFilename()}`,
];

/**
 * Tool implementation for finding and reading multiple text files from the local filesystem
 * within a specified target directory. The content is concatenated.
 * It is intended to run in an environment with access to the local file system (e.g., a Node.js backend).
 */
export class ReadManyFilesTool extends BaseTool<
  ReadManyFilesParams,
  ToolResult
> {
  static readonly Name: string = 'read_many_files';

  constructor(private config: Config) {
    const parameterSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        paths: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            minLength: '1',
          },
          minItems: '1',
          description:
            "Required. An array of glob patterns or paths relative to the tool's target directory. Examples: ['src/**/*.ts'], ['README.md', 'docs/']",
        },
        include: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            minLength: '1',
          },
          description:
            'Optional. Additional glob patterns to include. These are merged with `paths`.',
          default: [],
        },
        exclude: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            minLength: '1',
          },
          description:
            'Optional. Glob patterns for files/directories to exclude. Added to default excludes if useDefaultExcludes is true.',
          default: [],
        },
        recursive: {
          type: Type.BOOLEAN,
          description:
            'Optional. Whether to search recursively (primarily controlled by `**` in glob patterns). Defaults to true.',
          default: true,
        },
        useDefaultExcludes: {
          type: Type.BOOLEAN,
          description:
            'Optional. Whether to apply a list of default exclusion patterns (e.g., node_modules, .git, binary files). Defaults to true.',
          default: true,
        },
        file_filtering_options: {
          description:
            'Whether to respect ignore patterns from .gitignore or .geminiignore',
          type: Type.OBJECT,
          properties: {
            respect_git_ignore: {
              description:
                'Optional: Whether to respect .gitignore patterns when listing files. Only available in git repositories. Defaults to true.',
              type: Type.BOOLEAN,
            },
            respect_gemini_ignore: {
              description:
                'Optional: Whether to respect .geminiignore patterns when listing files. Defaults to true.',
              type: Type.BOOLEAN,
            },
          },
        },
      },
      required: ['paths'],
    };

    super(
      ReadManyFilesTool.Name,
      'ReadManyFiles',
      'Reads the content of multiple files and returns an array of objects, where each object contains the file content along with a session-unique version number and a SHA-256 hash. This versioned data is required for safely modifying files.',
      Icon.FileSearch,
      parameterSchema,
    );
  }

  validateParams(params: ReadManyFilesParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    return null;
  }

  getDescription(params: ReadManyFilesParams): string {
    const allPatterns = [...params.paths, ...(params.include || [])];
    const pathDesc = `using patterns: ${allPatterns.join(
      '`, `',
    )} (within target directory: ${this.config.getTargetDir()})`;

    // Determine the final list of exclusion patterns exactly as in execute method
    const paramExcludes = params.exclude || [];
    const paramUseDefaultExcludes = params.useDefaultExcludes !== false;
    const geminiIgnorePatterns = this.config
      .getFileService()
      .getGeminiIgnorePatterns();
    const finalExclusionPatternsForDescription: string[] =
      paramUseDefaultExcludes
        ? [...DEFAULT_EXCLUDES, ...paramExcludes, ...geminiIgnorePatterns]
        : [...paramExcludes, ...geminiIgnorePatterns];

    let excludeDesc = `Excluding: ${
      finalExclusionPatternsForDescription.length > 0
        ? `patterns like ${finalExclusionPatternsForDescription
            .slice(0, 2)
            .join('`, `')}${
            finalExclusionPatternsForDescription.length > 2 ? '...`' : '`'
          }`
        : 'none specified'
    }`;

    // Add a note if .geminiignore patterns contributed to the final list of exclusions
    if (geminiIgnorePatterns.length > 0) {
      const geminiPatternsInEffect = geminiIgnorePatterns.filter((p) =>
        finalExclusionPatternsForDescription.includes(p),
      ).length;
      if (geminiPatternsInEffect > 0) {
        excludeDesc += ` (includes ${geminiPatternsInEffect} from .geminiignore)`;
      }
    }

    return `Will attempt to read and concatenate files ${pathDesc}. ${excludeDesc}.`;
  }

  async execute(
    params: ReadManyFilesParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters for ${this.displayName}. Reason: ${validationError}`,
        returnDisplay: `## Parameter Error

${validationError}`,
      };
    }

    const {
      paths: inputPatterns,
      include = [],
      exclude = [],
      useDefaultExcludes = true,
    } = params;

    const sessionStateService = this.config.getSessionStateService();

    const searchPatterns = [...inputPatterns, ...include];
    if (searchPatterns.length === 0) {
      return {
        llmContent: 'No search paths or include patterns provided.',
        returnDisplay: `## Information

No search paths or include patterns were specified. Nothing to read or concatenate.`,
      };
    }

    const effectiveExcludes = useDefaultExcludes
      ? [...DEFAULT_EXCLUDES, ...exclude]
      : [...exclude];

    let foundFiles: string[];
    try {
      const workspaceDirs = this.config.getWorkspaceContext().getDirectories();
      const allEntries = new Set<string>();
      for (const dir of workspaceDirs) {
        const entriesInDir = await glob(
          searchPatterns.map((p) => p.replace(/\\/g, '/')),
          {
            cwd: dir,
            ignore: effectiveExcludes,
            nodir: true,
            dot: true,
            absolute: true,
            nocase: true,
            signal,
          },
        );
        for (const entry of entriesInDir) {
          allEntries.add(entry);
        }
      }
      foundFiles = Array.from(allEntries);
    } catch (error) {
      return {
        llmContent: `Error during file search: ${getErrorMessage(error)}`,
        returnDisplay: `## File Search Error

An error occurred while searching for files:

${getErrorMessage(error)}
`,
      };
    }

    const contentParts: Array<VersionedFile | Part> = [];
    const skippedFiles: Array<{ path: string; reason: string }> = [];

    const sortedFiles = foundFiles.sort();

    for (const filePath of sortedFiles) {
      try {
        const processedFile = await processSingleFileContent(
          filePath,
          this.config.getTargetDir(),
        );

        if (processedFile.error) {
          throw new Error(processedFile.error);
        }

        // We only version text files that can be patched.
        if (typeof processedFile.llmContent === 'string') {
          const versionedFile = await createVersionedFileObject(
            filePath,
            sessionStateService,
          );
          contentParts.push(versionedFile);
          recordFileOperationMetric(
            this.config,
            FileOperation.READ,
            versionedFile.content.split('\n').length,
            getSpecificMimeType(filePath),
            path.extname(filePath),
          );
        } else {
          // For non-text content (images, etc.), add it directly without versioning.
          if (processedFile.llmContent) {
            contentParts.push(processedFile.llmContent);
          }
        }
      } catch (error) {
        const relativePathForDisplay = path
          .relative(this.config.getTargetDir(), filePath)
          .replace(/\\/g, '/');
        skippedFiles.push({
          path: relativePathForDisplay,
          reason: getErrorMessage(error),
        });
      }
    }

    let displayMessage = `### ReadManyFiles Result (Target Dir: 
${this.config.getTargetDir()}
) 

`;
    if (contentParts.length > 0) {
      displayMessage += `Successfully read and processed **${contentParts.length} file(s)**.
`;
      const processedFilesRelativePaths = contentParts
        .filter((f): f is VersionedFile => 'file_path' in f)
        .map((f) => path.relative(this.config.getTargetDir(), f.file_path));
      if (processedFilesRelativePaths.length <= 10) {
        displayMessage += `
**Processed Files:**
`;
        processedFilesRelativePaths.forEach(
          (p) =>
            (displayMessage += `- 
${p}
`),
        );
      } else {
        displayMessage += `
**Processed Files (first 10 shown):**
`;
        processedFilesRelativePaths.slice(0, 10).forEach(
          (p) =>
            (displayMessage += `- 
${p}
`),
        );
        displayMessage += `- ...and ${processedFilesRelativePaths.length - 10} more.
`;
      }
    }

    if (skippedFiles.length > 0) {
      if (contentParts.length === 0) {
        displayMessage += `No files were read and processed based on the criteria.
`;
      }
      displayMessage += `
**Skipped ${skippedFiles.length} item(s):**
`;
      skippedFiles.slice(0, 5).forEach(
        (f) =>
          (displayMessage += `- ${f.path} (Reason: ${f.reason})
`),
      );
      if (skippedFiles.length > 5) {
        displayMessage += `- ...and ${skippedFiles.length - 5} more.
`;
      }
    } else if (contentParts.length === 0) {
      displayMessage += `No files were read and processed based on the criteria.
`;
    }

    if (contentParts.length === 0) {
      return {
        llmContent:
          'No files matching the criteria were found or all were skipped.',
        returnDisplay: displayMessage.trim(),
      };
    }

    return {
      llmContent: JSON.stringify(contentParts, null, 2),
      returnDisplay: displayMessage.trim(),
    };
  }
}
