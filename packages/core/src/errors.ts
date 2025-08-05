/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class InvalidDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDiffError';
  }
}
