/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { Config, MCPServerConfig } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Finds the first MCP server that has the specified capability.
 *
 * @param config The Gemini CLI configuration.
 * @param capability The capability to look for.
 * @returns The server configuration if found, otherwise undefined.
 */
export function findMcpServerWithCapability(
  config: Config,
  capability: string,
): MCPServerConfig | undefined {
  const servers = config.getMcpServers();
  if (!servers) {
    return undefined;
  }

  for (const serverName in servers) {
    const server = servers[serverName];
    if (server.capabilities && server.capabilities[capability]) {
      return server;
    }
  }

  return undefined;
}

/**
 * Loads state from an AMU server.
 *
 * @param server The server configuration.
 * @returns The state object if successful, otherwise undefined.
 */
export async function loadState(
  server: MCPServerConfig,
): Promise<Content | undefined> {
  if (!server.url) {
    return;
  }
  // The discovery URL is http://127.0.0.1:8000/mcp, and the loadState
  // URL is http://127.0.0.1:8000/loadState.
  const url = new URL(server.url);
  url.pathname = '/loadState';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `Error loading state from AMU server: ${response.statusText}`,
      );
      return undefined;
    }
    return (await response.json()) as Content;
  } catch (error) {
    console.error(
      `Error loading state from AMU server: ${getErrorMessage(error)}`,
    );
    return undefined;
  }
}
