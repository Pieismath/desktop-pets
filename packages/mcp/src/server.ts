#!/usr/bin/env node
/**
 * MCP stdio server exposing the pet as three tools. Agents speak the
 * reaction vocabulary only — never sprite rows (those belong to the host).
 * If the pet app isn't running, tools succeed with a note instead of
 * erroring: a missing pet must never derail an agent.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PetClient } from '@desktop-pets/client';
import { REACTIONS } from '@desktop-pets/shared';
import type { Reaction } from '@desktop-pets/shared';

const reactionEnum = z.enum(REACTIONS as unknown as [Reaction, ...Reaction[]]);

async function withClient(fn: (client: PetClient) => void): Promise<string> {
  const client = await PetClient.connect({
    role: 'mcp',
    timeoutMs: 300,
    session: {
      cwd: process.cwd(),
      ...(process.env['TERM_PROGRAM'] ? { termProgram: process.env['TERM_PROGRAM'] } : {}),
      ...(process.env['__CFBundleIdentifier'] ? { bundleId: process.env['__CFBundleIdentifier'] } : {}),
    },
  });
  if (!client) return 'desktop-pets host is not running; nothing displayed';
  try {
    fn(client);
  } finally {
    await client.close();
  }
  return 'ok';
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

export async function startServer(): Promise<void> {
  const server = new McpServer({ name: 'desktop-pets', version: '0.1.0' });

  server.registerTool(
    'pet_status',
    {
      description:
        'Set the pet\'s persistent status (loops until changed). Use for ongoing conditions: working, waiting, error. Message is optional and will be sanitised before display.',
      inputSchema: { state: reactionEnum, message: z.string().max(500).optional() },
    },
    async ({ state, message }) => text(await withClient((c) => c.status(state, message))),
  );

  server.registerTool(
    'pet_react',
    {
      description:
        'Play a one-shot reaction animation (waving, success, celebrating, error…), then return to the current status. Message is optional, sanitised, and shown briefly.',
      inputSchema: { reaction: reactionEnum, message: z.string().max(500).optional() },
    },
    async ({ reaction, message }) => text(await withClient((c) => c.react(reaction, message))),
  );

  server.registerTool(
    'pet_say',
    {
      description:
        'Show a short speech bubble on the pet for a few seconds. Text is sanitised: paths, URLs, secrets and extra lines are stripped before display.',
      inputSchema: { message: z.string().min(1).max(500) },
    },
    async ({ message }) => text(await withClient((c) => c.say(message))),
  );

  await server.connect(new StdioServerTransport());
}
