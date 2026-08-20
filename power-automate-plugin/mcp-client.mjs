#!/usr/bin/env node
// Minimal MCP stdio client for the bundled FlowAgent server (server/mcp.mjs).
// Usage: node mcp-client.mjs calls.json
// calls.json: an array of { "tool": "list_environments", "args": {} } objects,
// executed sequentially against one long-lived server process.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, 'server', 'mcp.mjs');
const callsPath = process.argv[2];
if (!callsPath) {
  console.error('Usage: node mcp-client.mjs <calls.json>');
  process.exit(1);
}
const calls = JSON.parse(readFileSync(callsPath, 'utf8'));

const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = readline.createInterface({ input: child.stdout });

let nextId = 1;
const pending = new Map();

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // ignore non-JSON stdout noise
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg);
  }
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

async function main() {
  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'manual-fpl-client', version: '1.0.0' },
  });
  notify('notifications/initialized', {});

  for (const call of calls) {
    const res =
      call.tool === '__list_tools__'
        ? await request('tools/list', {})
        : await request('tools/call', { name: call.tool, arguments: call.args ?? {} });
    console.log(`\n=== ${call.tool} ===`);
    console.log(JSON.stringify(res.result ?? res.error, null, 2));
  }

  child.stdin.end();
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
