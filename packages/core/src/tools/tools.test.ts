/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect } from 'vitest';
import { BaseTool } from './tools.js';
import { FunctionDeclaration, Schema } from '@google/generative-ai';

class TestTool extends BaseTool {
  name = 'test_tool';
  description = 'A tool for testing.';
  parameters: FunctionDeclaration['parameters'] = {
    type: 'OBJECT',
    properties: {},
    required: [],
  };
  displayName = 'Test Tool';
  icon = null;
  parameterSchema: Schema = {
    type: 'OBJECT',
    properties: {},
    required: [],
  };

  constructor(timeout?: number) {
    // @ts-expect-error - icon is null for testing
    super('test_tool', 'Test Tool', 'A tool for testing.', null, {}, true, false, timeout);
  }

  async execute(): Promise<string> {
    return 'test';
  }
}


describe('BaseTool', () => {
  it('should have a timeout property', () => {
    const tool = new TestTool(1000);
    expect(tool.timeout).toBe(1000);
  });
});
