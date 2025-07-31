/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { Config, MCPServerConfig } from '../config/config.js';

export function findMcpServerWithCapability(
  config: Config,
  capability: string,
): MCPServerConfig | undefined {
  const servers = config.getMcpServers();
  if (!servers) {
    return undefined;
  }

  for (const server of Object.values(servers)) {
    if (server.capabilities?.[capability]) {
      return server;
    }
  }

  return undefined;
}

export async function loadState(
  server: MCPServerConfig,
): Promise<Content | undefined> {
  if (!server.url) {
    return undefined;
  }

  // The plan is to derive the /loadState URL from the base MCP URL.
  // e.g., http://127.0.0.1:8000/mcp -> http://127.0.0.1:8000/loadState
  const url = new URL(server.url);
  url.pathname = '/loadState';

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as Content;
  } catch (error) {
    console.error(`Failed to load state from AMU server:`, error);
    return undefined;
  }
}
