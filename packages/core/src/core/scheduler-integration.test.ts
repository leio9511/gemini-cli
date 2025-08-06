/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  CoreToolScheduler,
  CompletedToolCall as SchedulerCompletedToolCall,
} from './coreToolScheduler.js';
import { BaseTool, ToolResult } from '../tools/tools.js';
import { ApprovalMode, Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { SessionStateService } from '../services/session-state-service.js';
import { ToolRegistry } from '../tools/tool-registry.js';

// A mock tool for testing purposes
class MockTool extends BaseTool<unknown, ToolResult> {
  constructor(private structuredOutput: object) {
    super('mock_tool', 'MockTool', 'A mock tool for testing');
  }

  async execute(): Promise<ToolResult> {
    return {
      llmContent: this.structuredOutput,
      returnDisplay: 'Mock tool executed',
    };
  }
}

describe('CoreToolScheduler Integration', () => {
  it('should handle structured object llmContent from a tool correctly', async () => {
    const structuredDataObject = {
      file_path: '/test/file.txt',
      content: 'This is file content.\nWith newlines.',
      version: 1,
    };

    const mockTool = new MockTool(structuredDataObject);

    const mockConfig = {
      getFileService: () => new FileDiscoveryService('/root'),
      getTargetDir: () => '/root',
      getWorkspaceContext: () => createMockWorkspaceContext('/root'),
      getSessionStateService: () => new SessionStateService(),
      getApprovalMode: () => ApprovalMode.YOLO,
      getUsageStatisticsEnabled: () => false,
    } as Partial<Config>;

    const toolRegistry = new ToolRegistry(mockConfig as Config);
    toolRegistry.registerTool(mockTool);

    const completedToolCalls = await new Promise<SchedulerCompletedToolCall[]>(
      (resolve) => {
        const scheduler = new CoreToolScheduler({
          toolRegistry: Promise.resolve(toolRegistry),
          config: mockConfig as Config,
          getPreferredEditor: () => undefined,
          onAllToolCallsComplete: (calls) => {
            resolve(calls);
          },
        });

        const toolCall = {
          callId: 'tool-call-1',
          name: 'mock_tool',
          args: {},
        };

        scheduler.schedule(toolCall, new AbortController().signal);
      },
    );

    expect(completedToolCalls).toHaveLength(1);
    const completedCall = completedToolCalls[0];
    // The scheduler wraps the response, so we need to access it correctly.
    const functionResponse =
      completedCall.response.responseParts.functionResponse;

    expect(completedCall.request.callId).toBe('tool-call-1');
    expect(functionResponse.id).toBe('tool-call-1');
    expect(functionResponse.name).toBe('mock_tool');
    // This is the key assertion for the test
    expect(functionResponse.response).toEqual(structuredDataObject);
  });
});
