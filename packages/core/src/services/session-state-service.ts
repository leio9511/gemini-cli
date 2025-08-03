/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class SessionStateService {
  private versionCounter = 0;

  getNextVersion(): number {
    this.versionCounter++;
    return this.versionCounter;
  }
}
