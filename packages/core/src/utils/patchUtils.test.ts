/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { applyFuzzyPatch } from './patchUtils';
import * as Errors from '../errors.js';

describe('applyFuzzyPatch', () => {
  const testDataDir = path.join(
    __dirname,
    '__tests__',
    'testdata',
    'fuzzy-patch',
  );

  it('should correctly apply a valid patch', async () => {
    const sourcePath = path.join(testDataDir, 'source_1.txt');
    const diffPath = path.join(testDataDir, 'diff_1.txt');
    const expectedPath = path.join(testDataDir, 'expected_1.txt');

    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    const diffContent = await fs.readFile(diffPath, 'utf-8');
    const expectedContent = await fs.readFile(expectedPath, 'utf-8');

    const patchedContent = applyFuzzyPatch(sourceContent, diffContent);
    expect(patchedContent.trim()).toEqual(expectedContent.trim());
  });

  it('should correctly apply a patch that adds a new line', async () => {
    const sourcePath = path.join(testDataDir, 'source_2.txt');
    const diffPath = path.join(testDataDir, 'diff_2.txt');
    const expectedPath = path.join(testDataDir, 'expected_2.txt');

    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    const diffContent = await fs.readFile(diffPath, 'utf-8');
    const expectedContent = await fs.readFile(expectedPath, 'utf-8');

    const patchedContent = applyFuzzyPatch(sourceContent, diffContent);
    expect(patchedContent.trim()).toEqual(expectedContent.trim());
  });

  it('should correctly apply a patch with multiple hunks', async () => {
    const sourcePath = path.join(testDataDir, 'source_3.txt');
    const diffPath = path.join(testDataDir, 'diff_3.txt');
    const expectedPath = path.join(testDataDir, 'expected_3.txt');

    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    const diffContent = await fs.readFile(diffPath, 'utf-8');
    const expectedContent = await fs.readFile(expectedPath, 'utf-8');

    const patchedContent = applyFuzzyPatch(sourceContent, diffContent);
    expect(patchedContent.trim()).toEqual(expectedContent.trim());
  });

  it('should throw InvalidDiffError for a fundamentally invalid diff', () => {
    const sourceContent = 'Hello, World!';
    const invalidDiff = `--- a/source.txt
+++ b/source.txt
@@ -1,1 +1,1 @@
-Goodbye, World!
+Hello, Gemini!
`;
    expect(() => applyFuzzyPatch(sourceContent, invalidDiff)).toThrow(
      Errors.InvalidDiffError,
    );
  });

  it('should correctly apply a patch for a new file', () => {
    const sourceContent = '';
    const diffContent = `--- /dev/null
+++ b/new_file.txt
@@ -0,0 +1,3 @@
+This is a new file.
+It has three lines.
+This is the third line.
`;
    const expectedContent = `This is a new file.
It has three lines.
This is the third line.`;
    const patchedContent = applyFuzzyPatch(sourceContent, diffContent);
    expect(patchedContent.trim()).toEqual(expectedContent);
  });
});
