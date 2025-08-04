/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as diff from 'diff';

// The number of lines to search above and below the diff's line number hint.
const SEARCH_WINDOW_RADIUS = 40;

export class InvalidDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDiffError';
  }
}

/**
 * Finds a match for hunkLines within targetLines, tolerating extra blank lines
 * in the target that are not present in the hunk. This is a port of the logic
 * in docs/designs/fuzzy_patch.py.
 *
 * The function works in several stages:
 * 1. It creates a `corePattern` by stripping all blank lines from the input
 *    hunk. This pattern represents the essential, non-blank lines that must
 *    be matched in order.
 * 2. It establishes a search window in the target file, starting near the
 *    line number hint from the diff.
 * 3. It iterates through the target file, attempting to match the first line
 *    of the `corePattern`.
 * 4. Once the first line matches, it continues comparing the subsequent lines
 *    of the `corePattern` with the lines in the target file.
 * 5. If a line in the target file is blank, it is skipped, making the match
 *    flexible.
 * 6. If a non-blank line in the target does not match the pattern, that
 *    match attempt fails, and the search continues from the next line.
 *
 * @param targetLines The lines of the file to be patched.
 * @param hunkLines The context/removed lines from the hunk.
 * @param searchStartIdx The index in targetLines to start searching from.
 * @returns The 0-indexed starting line of the match, or -1 if not found.
 */
function findFlexibleMatch(
  targetLines: string[],
  hunkLines: string[],
  searchStartIdx = 0,
): number {
  // 1. Create a `corePattern` of only the non-blank lines from the hunk.
  const corePattern = hunkLines
    .map((line) => line.trimEnd())
    .filter((line) => line);

  if (corePattern.length === 0) {
    // If hunk is only blank lines, fall back to exact match for that block.
    for (
      let i = searchStartIdx;
      i <= targetLines.length - hunkLines.length;
      i++
    ) {
      const targetSliceStripped = targetLines
        .slice(i, i + hunkLines.length)
        .map((line) => line.trimEnd());
      if (
        JSON.stringify(targetSliceStripped) ===
        JSON.stringify(hunkLines.map((line) => line.trimEnd()))
      ) {
        return i;
      }
    }
    return -1;
  }

  // 2. Iterate through the target file to find a starting match.
  for (let i = searchStartIdx; i < targetLines.length; i++) {
    let patternPtr = 0;
    let targetPtr = i;

    // 3. Find the first line of the corePattern.
    while (
      targetPtr < targetLines.length &&
      targetLines[targetPtr].trimEnd() !== corePattern[0]
    ) {
      targetPtr++;
    }

    if (targetPtr >= targetLines.length) {
      // Could not even find the start of the pattern.
      return -1;
    }

    const matchStartIdx = targetPtr;
    patternPtr = 1;
    targetPtr++;

    // 4. Match the rest of the pattern, allowing for flexible blank lines.
    while (patternPtr < corePattern.length && targetPtr < targetLines.length) {
      const targetLineStripped = targetLines[targetPtr].trimEnd();
      if (targetLineStripped === corePattern[patternPtr]) {
        patternPtr++;
      } else if (targetLineStripped !== '') {
        // 6. Mismatch on a non-blank line, this attempt fails.
        break;
      }
      // 5. If it's a blank line, we just skip it by advancing targetPtr.
      targetPtr++;
    }

    if (patternPtr === corePattern.length) {
      // We successfully matched all non-blank lines in the pattern.
      return matchStartIdx;
    }
  }

  return -1;
}

function formatHunk(hunk: diff.Hunk): string {
  const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
  return [header, ...hunk.lines].join('\n');
}

function formatDiff(parsedDiff: diff.ParsedDiff): string {
  const headers = [];
  if (parsedDiff.oldFileName) {
    headers.push(`--- ${parsedDiff.oldFileName}`);
  }
  if (parsedDiff.newFileName) {
    headers.push(`+++ ${parsedDiff.newFileName}`);
  }
  if (parsedDiff.oldHeader) {
    headers.push(parsedDiff.oldHeader);
  }
  if (parsedDiff.newHeader) {
    headers.push(parsedDiff.newHeader);
  }

  const hunksStr = parsedDiff.hunks.map(formatHunk).join('\n');
  return [...headers, hunksStr].join('\n');
}

/**
 * Orchestrates the correction of a unified diff.
 * It parses the diff, iterates through each file patch and each hunk,
 * calling `findFlexibleMatch` to find the correct application line number
 * before reconstructing the diff with the corrected line numbers.
 */
export function correctDiff(baseContent: string, unifiedDiff: string): string {
  const parsedDiffs = diff.parsePatch(unifiedDiff);
  if (!parsedDiffs || parsedDiffs.length === 0) {
    throw new InvalidDiffError('Invalid Diff: Could not parse patch.');
  }

  const baseLines = baseContent.split('\n');
  const finalCorrectedDiffs = [];

  for (const parsedDiff of parsedDiffs) {
    if (
      parsedDiff.oldFileName === '/dev/null' ||
      parsedDiff.newFileName === '/dev/null'
    ) {
      finalCorrectedDiffs.push(parsedDiff);
      continue;
    }

    const correctedHunks = [];
    for (const hunk of parsedDiff.hunks) {
      const hunkLinesForOriginal = hunk.lines
        .filter((line) => line.startsWith(' ') || line.startsWith('-'))
        .map((line) => line.substring(1));

      if (hunkLinesForOriginal.length === 0) {
        correctedHunks.push(hunk);
        continue;
      }

      const hintSearchStart0idx = hunk.oldStart > 0 ? hunk.oldStart - 1 : 0;
      const windowSearchStart = Math.max(
        0,
        hintSearchStart0idx - SEARCH_WINDOW_RADIUS,
      );

      let matchStartIdx = findFlexibleMatch(
        baseLines,
        hunkLinesForOriginal,
        windowSearchStart,
      );

      if (matchStartIdx === -1) {
        matchStartIdx = findFlexibleMatch(baseLines, hunkLinesForOriginal, 0);
      }

      if (matchStartIdx !== -1) {
        correctedHunks.push({ ...hunk, oldStart: matchStartIdx + 1 });
      } else {
        throw new InvalidDiffError(
          `Invalid Diff: The provided diff content does not match the file's content. The context or lines to be removed may be incorrect.`,
        );
      }
    }
    finalCorrectedDiffs.push({ ...parsedDiff, hunks: correctedHunks });
  }

  return finalCorrectedDiffs.map(formatDiff).join('\n');
}
