/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { MCPServerConfig, Config } from '../config/config.js';
import { findMcpServerWithCapability, loadState } from './mcp-client.js';
import { Content } from '@google/genai';

describe('mcp-client', () => {
  describe('findMcpServerWithCapability', () => {
    it('should return the server config if capability is found', () => {
      const serverConfig = new MCPServerConfig(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { 'amu/loadState': {} },
      );
      const config = {
        getMcpServers: () => ({
          'test-server': serverConfig,
        }),
      } as unknown as Config;

      const result = findMcpServerWithCapability(config, 'amu/loadState');
      expect(result).toEqual(serverConfig);
    });

    it('should return undefined if no server has the capability', () => {
      const serverConfig = new MCPServerConfig(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { 'other/capability': {} },
      );
      const config = {
        getMcpServers: () => ({
          'test-server': serverConfig,
        }),
      } as unknown as Config;

      const result = findMcpServerWithCapability(config, 'amu/loadState');
      expect(result).toBeUndefined();
    });

    it('should return undefined if there are no mcp servers configured', () => {
      const config = {
        getMcpServers: () => undefined,
      } as unknown as Config;

      const result = findMcpServerWithCapability(config, 'amu/loadState');
      expect(result).toBeUndefined();
    });
  });

  describe('loadState', () => {
    it('should fetch and return state from the server', async () => {
      const mockState: Content = {
        role: 'user',
        parts: [{ text: 'agent state' }],
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockState),
      });

      const serverConfig = new MCPServerConfig(
        undefined,
        undefined,
        undefined,
        undefined,
        'http://127.0.0.1:8000/mcp',
      );

      const result = await loadState(serverConfig);
      expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/loadState');
      expect(result).toEqual(mockState);
    });

    it('should return undefined if the fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const serverConfig = new MCPServerConfig(
        undefined,
        undefined,
        undefined,
        undefined,
        'http://127.0.0.1:8000/mcp',
      );

      const result = await loadState(serverConfig);
      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
