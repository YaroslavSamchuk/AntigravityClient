#!/usr/bin/env node
import { startProxyServer } from './server.js';

const args = process.argv.slice(2);
let port = 3000;
let host = '0.0.0.0';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    if (args[i + 1]) port = parseInt(args[i + 1], 10) || 3000;
  } else if (args[i] === '--host' || args[i] === '-h') {
    if (args[i + 1]) host = args[i + 1];
  } else if (args[i] === '--help') {
    console.log(`
Antigravity Proxy Server CLI 🌌

Usage:
  npx antigravity-client [options]
  npx antigravity-server [options]

Options:
  -p, --port <number>   Port to listen on (default: 3000)
  -h, --host <string>   Host to bind to (default: 0.0.0.0)
  --help                Show this help message

Example in React / Web client:
  import { Antigravity } from 'antigravity-client';
  const ag = new Antigravity({ serverUrl: 'http://localhost:3000' });
`);
    process.exit(0);
  }
}

if (process.env.PORT && !args.includes('--port') && !args.includes('-p')) {
  port = parseInt(process.env.PORT, 10) || 3000;
}

startProxyServer({ port, host, verbose: true }).catch((err) => {
  console.error('❌ Failed to start Antigravity proxy server:', err.message);
  process.exit(1);
});
