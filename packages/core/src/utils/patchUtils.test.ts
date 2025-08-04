/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { correctDiff } from './patchUtils';

describe('correctDiff', () => {
  const baseContent = `line 1
line 2
line 3
line 4
line 5
line 6
line 7
line 8
line 9
line 10`;

  it('should return an identical diff if line numbers are already correct', () => {
    const patch = `--- a/file.txt
+++ b/file.txt
@@ -2,7 +2,7 @@
 line 2
 line 3
 line 4
-line 5
+line five
 line 6
 line 7
 line 8`;
    const result = correctDiff(baseContent, patch);
    expect(result).toBe(patch);
  });

  it('should correct the line number if context is found elsewhere', () => {
    const patchWithWrongLine = `--- a/file.txt
+++ b/file.txt
@@ -1,7 +1,7 @@
 line 2
 line 3
 line 4
-line 5
+line five
 line 6
 line 7
 line 8`;
    const expectedCorrectedPatch = `--- a/file.txt
+++ b/file.txt
@@ -2,7 +1,7 @@
 line 2
 line 3
 line 4
-line 5
+line five
 line 6
 line 7
 line 8`;
    const result = correctDiff(baseContent, patchWithWrongLine);
    expect(result).toBe(expectedCorrectedPatch);
  });

  it('should throw an error if the diff context is not found', () => {
    const patch = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 not found line 1
-not found line 2
+not found line two`;
    expect(() => correctDiff(baseContent, patch)).toThrow(
      `Invalid Diff: The provided diff content does not match the file's content. The context or lines to be removed may be incorrect.`,
    );
  });

  it('should handle content with blank lines', () => {
    const contentWithBlanks = `line 1
line 2

line 4
line 5`;
    const patch = `--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
 line 1
 line 2
 
-line 4
+line four
 line 5`;
    const result = correctDiff(contentWithBlanks, patch);
    expect(result).toBe(patch);
  });
});
