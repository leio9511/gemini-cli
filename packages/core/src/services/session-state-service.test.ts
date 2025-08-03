/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SessionStateService } from './session-state-service.js';

describe('SessionStateService', () => {
  it('should start versioning at 1 and increment on subsequent calls', () => {
    const service = new SessionStateService();
    expect(service.getNextVersion()).toBe(1);
    expect(service.getNextVersion()).toBe(2);
    expect(service.getNextVersion()).toBe(3);
  });

  it('should reset the counter for a new instance', () => {
    const service1 = new SessionStateService();
    expect(service1.getNextVersion()).toBe(1);
    expect(service1.getNextVersion()).toBe(2);

    const service2 = new SessionStateService();
    expect(service2.getNextVersion()).toBe(1);
  });
});
