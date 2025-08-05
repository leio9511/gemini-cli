/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Errors from '../errors.js';

// This is a direct port of the Python script's find_flexible_match function.
function findFlexibleMatch(
  targetLines: string[],
  hunkLines: string[],
  searchStartIdx = 0,
): [boolean, number, number] {
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
        return [true, i, i + hunkLines.length];
      }
    }
    return [false, -1, -1];
  }

  for (let i = searchStartIdx; i < targetLines.length; i++) {
    let patternPtr = 0;
    let targetPtr = i;

    // Try to match the first non-blank line of the pattern
    while (
      targetPtr < targetLines.length &&
      targetLines[targetPtr].trimEnd() !== corePattern[0]
    ) {
      targetPtr++;
    }

    if (targetPtr >= targetLines.length) {
      // Could not even find the start of the pattern
      return [false, -1, -1];
    }

    const matchStartIdx = targetPtr;
    patternPtr = 1;
    targetPtr++;

    while (patternPtr < corePattern.length && targetPtr < targetLines.length) {
      const targetLineStripped = targetLines[targetPtr].trimEnd();
      if (targetLineStripped === corePattern[patternPtr]) {
        patternPtr++;
      } else if (targetLineStripped !== '') {
        // Mismatch on a non-blank line, this attempt fails.
        break;
      }
      // If it's a blank line, we just skip it by advancing targetPtr
      targetPtr++;
    }

    if (patternPtr === corePattern.length) {
      // We successfully matched all non-blank lines in the pattern
      return [true, matchStartIdx, targetPtr];
    }
  }

  return [false, -1, -1];
}

// This is a direct port of the Python script's apply_fuzzy_patch function.
export function applyFuzzyPatch(
  originalContent: string,
  unifiedDiff: string,
): string {
  const targetLines = originalContent.split(/\r?\n/);

  const diffLinesRaw = unifiedDiff.split(/\r?\n/);
  const diffContentForSplit = diffLinesRaw.join('\n');

  const patchedLines = [...targetLines];

  // Parse the diff into hunks.
  const diffParts = diffContentForSplit.split(/^(?=^@@)/m);

  if (
    diffParts &&
    diffParts[0] &&
    !diffParts[0].startsWith('@@') &&
    diffParts[0].trim()
  ) {
    diffParts.shift();
  }

  if (!diffParts || (diffParts.length === 1 && !diffParts[0].trim())) {
    return originalContent;
  }

  let currentFileOffset = 0;

  // Process hunks sequentially.
  for (const hunkText of diffParts) {
    const hunkTextStrippedOverall = hunkText.trim();
    if (!hunkTextStrippedOverall || !hunkTextStrippedOverall.startsWith('@@')) {
      continue;
    }

    const linesInHunkWithHeader = hunkTextStrippedOverall.split('\n');
    const hunkHeader = linesInHunkWithHeader[0];
    const hunkBodyLinesRaw = linesInHunkWithHeader.slice(1);

    const headerMatch = hunkHeader.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
    );
    if (!headerMatch) {
      throw new Errors.InvalidDiffError(
        `Error: Could not parse hunk header: ${hunkHeader}`,
      );
    }

    const oldStartLine1idx = parseInt(headerMatch[1], 10);

    const currentHunkOriginalBlockStripped: string[] = [];
    const currentHunkNewBlockRaw: string[] = [];

    for (const lineInHunkBody of hunkBodyLinesRaw) {
      if (
        !lineInHunkBody &&
        hunkBodyLinesRaw.length === 1 &&
        !lineInHunkBody.startsWith('-') &&
        !lineInHunkBody.startsWith('+') &&
        !lineInHunkBody.startsWith(' ')
      ) {
        continue;
      }
      if (!lineInHunkBody) {
        continue;
      }

      const op = lineInHunkBody[0];
      const contentRaw = lineInHunkBody.substring(1);
      const contentStripped = contentRaw.trimEnd();

      if (op === ' ') {
        currentHunkOriginalBlockStripped.push(contentStripped);
        currentHunkNewBlockRaw.push(contentRaw);
      } else if (op === '-') {
        currentHunkOriginalBlockStripped.push(contentStripped);
      } else if (op === '+') {
        currentHunkNewBlockRaw.push(contentRaw);
      }
    }

    if (currentHunkOriginalBlockStripped.length === 0) {
      if (currentHunkNewBlockRaw.length === 0) {
        continue;
      }

      let insertionPoint0idx: number;
      if (oldStartLine1idx === 0) {
        insertionPoint0idx = currentFileOffset;
      } else {
        insertionPoint0idx = oldStartLine1idx - 1 + currentFileOffset;
      }

      insertionPoint0idx = Math.max(
        0,
        Math.min(insertionPoint0idx, patchedLines.length),
      );

      patchedLines.splice(insertionPoint0idx, 0, ...currentHunkNewBlockRaw);
      currentFileOffset += currentHunkNewBlockRaw.length;
      continue;
    }

    let foundMatchInTarget = false;
    let matchStartIdx0idx = -1;
    let matchEndIdx0idx = -1;

    const hintSearchStart0idx = oldStartLine1idx - 1 + currentFileOffset;
    const searchWindowRadius = 40;

    const windowSearchStart = Math.max(
      0,
      hintSearchStart0idx - searchWindowRadius,
    );

    // Find a match for the hunk in the target file.
    [foundMatchInTarget, matchStartIdx0idx, matchEndIdx0idx] =
      findFlexibleMatch(
        patchedLines,
        currentHunkOriginalBlockStripped,
        windowSearchStart,
      );

    if (!foundMatchInTarget) {
      [foundMatchInTarget, matchStartIdx0idx, matchEndIdx0idx] =
        findFlexibleMatch(patchedLines, currentHunkOriginalBlockStripped, 0);
    }

    if (foundMatchInTarget) {
      const replacedBlockLen = matchEndIdx0idx - matchStartIdx0idx;

      // Apply the patch.
      patchedLines.splice(
        matchStartIdx0idx,
        replacedBlockLen,
        ...currentHunkNewBlockRaw,
      );
      currentFileOffset += currentHunkNewBlockRaw.length - replacedBlockLen;
    } else {
      const firstNonMatchingLine = currentHunkOriginalBlockStripped[0];
      throw new Errors.InvalidDiffError(
        'Hunk Content Mismatch: Could not find the context for a hunk in the source file. ' +
          `The mismatch occurred while searching for this line: 
` +
          firstNonMatchingLine +
          `
 from the diff. ` +
          "Please verify that the context lines (starting with ' ') and removal lines (starting with '-') " +
          'in the diff *exactly* match the source file, including all indentation and whitespace.',
      );
    }
  }

  return patchedLines.join('\n');
}
