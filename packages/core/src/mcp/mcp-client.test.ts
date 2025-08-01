/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, test, describe, vi } from 'vitest';
import { findMcpServerWithCapability, loadState } from './mcp-client.js';
import { Config, MCPServerConfig } from '../config/config.js';

describe('findMcpServerWithCapability', () => {
  test('should return the server with the specified capability', () => {
    const config = {
      getMcpServers: () => ({
        server1: {
          capabilities: {
            'amu/loadState': true,
          },
        },
        server2: {
          capabilities: {
            'other/capability': true,
          },
        },
      }),
    } as unknown as Config;

    const server = findMcpServerWithCapability(config, 'amu/loadState');
    expect(server).toBeDefined();
    expect(server?.capabilities).toHaveProperty('amu/loadState');
  });

  test('should return undefined if no server has the capability', () => {
    const config = {
      getMcpServers: () => ({
        server1: {
          capabilities: {
            'other/capability': true,
          },
        },
      }),
    } as unknown as Config;

    const server = findMcpServerWithCapability(config, 'amu/loadState');
    expect(server).toBeUndefined();
  });

  test('should return undefined if there are no servers', () => {
    const config = {
      getMcpServers: () => ({}),
    } as unknown as Config;

    const server = findMcpServerWithCapability(config, 'amu/loadState');
    expect(server).toBeUndefined();
  });
});

describe('loadState', () => {
  test('should load state from the server using url', async () => {
    const server: MCPServerConfig = {
      url: 'http://localhost:8000/mcp',
    };
    const mockResponse = {
      parts: [{ text: 'test state' }],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const state = await loadState(server);
    expect(state).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      new URL('http://localhost:8000/loadState'),
    );
  });

  test('should load state from the server using httpUrl', async () => {
    const server: MCPServerConfig = {
      httpUrl: 'http://localhost:8080/mcp',
    };
    const mockResponse = {
      parts: [{ text: 'test state http' }],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const state = await loadState(server);
    expect(state).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      new URL('http://localhost:8080/loadState'),
    );
  });

  test('should return undefined if the request fails', async () => {
    const server: MCPServerConfig = {
      url: 'http://localhost:8000/mcp',
    };
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const state = await loadState(server);
    expect(state).toBeUndefined();
  });

  test('should return undefined if the response is not ok', async () => {
    const server: MCPServerConfig = {
      url: 'http://localhost:8000/mcp',
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });

    const state = await loadState(server);
    expect(state).toBeUndefined();
  });
});
