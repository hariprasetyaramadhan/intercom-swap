#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function usage() {
  return `
rfqbotmgr (manage local RFQ bot processes)

Commands:
  start-maker --name <id> --store <peerStoreName> --sc-port <n> [--log <path>] [--receipts-db <path>] [--] [rfq-maker args...]
  start-taker --name <id> --store <peerStoreName> --sc-port <n> [--log <path>] [--receipts-db <path>] [--] [rfq-taker args...]
  stop --name <id> [--signal <SIGTERM|SIGINT|SIGKILL>] [--wait-ms <n>]
  restart --name <id> [--wait-ms <n>]
  status [--name <id>]

Notes:
  - This never stops the peer (pear run). It only controls bot processes started via rfqbotmgr.
  - State is stored under onchain/rfq-bots/ (gitignored).
`.trim();
}

function parseArgs(argv) {
  const args = [];
  const flags = new Map();
  let passthru = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') {
      passthru = argv.slice(i + 1);
      break;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) flags.set(key, true);
      else {
        flags.set(key, next);
        i += 1;
      }
    } else {
      args.push(a);
    }
  }
  return { args, flags, passthru };
}

function requireFlag(flags, name) {
  const v = flags.get(name);
  if (!v || v === true) die(`Missing --${name}`);
  return String(v);
}

function maybeFlag(flags, name, fallback = '') {
  const v = flags.get(name);
  if (!v || v === true) return fallback;
  return String(v);
}

function maybeInt(flags, name, fallback = null) {
  const v = flags.get(name);
  if (v === undefined || v === null || v === true) return fallback;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) die(`Invalid --${name}`);
  return n;
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolvePathMaybeRelative(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  return path.isAbsolute(s) ? s : path.resolve(process.cwd(), s);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const stateDir = path.join(repoRoot, 'onchain', 'rfq-bots');

function statePaths(name) {
  const safe = String(name).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  return {
    json: path.join(stateDir, `${safe}.json`),
    pid: path.join(stateDir, `${safe}.pid`),
    log: path.join(stateDir, `${safe}.log`),
  };
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_e) {
    return false;
  }
}

async function waitForExit(pid, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isAlive(pid);
}

function buildBotArgs({ role, store, scPort, receiptsDb, passthru }) {
  const tokenFile = path.join(repoRoot, 'onchain', 'sc-bridge', `${store}.token`);
  if (!fs.existsSync(tokenFile)) {
    die(`Missing SC-Bridge token file: ${tokenFile}\nHint: start the peer once (scripts/run-swap-*.sh) to generate it.`);
  }
  const token = fs.readFileSync(tokenFile, 'utf8').trim();
  if (!token) die(`Empty SC-Bridge token: ${tokenFile}`);

  const url = `ws://127.0.0.1:${scPort}`;
  const script = role === 'maker' ? 'scripts/rfq-maker.mjs' : 'scripts/rfq-taker.mjs';

  const args = [script, '--url', url, '--token', token];
  if (receiptsDb) args.push('--receipts-db', receiptsDb);
  for (const a of passthru || []) args.push(a);
  return args;
}

function startBot({ name, role, store, scPort, logPath, receiptsDb, passthru }) {
  mkdirp(stateDir);
  const paths = statePaths(name);
  const log = resolvePathMaybeRelative(logPath) || paths.log;
  const receipts = receiptsDb ? resolvePathMaybeRelative(receiptsDb) : path.join(repoRoot, 'onchain', 'receipts', `${store}.sqlite`);

  const args = buildBotArgs({ role, store, scPort, receiptsDb: receipts, passthru });

  const outFd = fs.openSync(log, 'a');
  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: { ...process.env },
  });
  try {
    fs.closeSync(outFd);
  } catch (_e) {}
  child.unref();

  fs.writeFileSync(paths.pid, `${child.pid}\n`);
  writeJson(paths.json, {
    v: 1,
    name,
    role,
    store,
    sc_port: Number(scPort),
    receipts_db: receipts,
    log,
    args_passthru: Array.isArray(passthru) ? passthru : [],
    started_at: Date.now(),
  });

  process.stdout.write(`${JSON.stringify({ type: 'bot_started', name, role, pid: child.pid, log, receipts_db: receipts })}\n`);
}

async function stopBot({ name, signal = 'SIGTERM', waitMs = 2000 }) {
  mkdirp(stateDir);
  const paths = statePaths(name);
  const pidText = fs.existsSync(paths.pid) ? fs.readFileSync(paths.pid, 'utf8').trim() : '';
  const pid = pidText ? Number.parseInt(pidText, 10) : null;
  if (!pid || !Number.isFinite(pid)) {
    process.stdout.write(`${JSON.stringify({ type: 'bot_stopped', name, ok: true, pid: null, reason: 'no_pidfile' })}\n`);
    return;
  }

  if (!isAlive(pid)) {
    try { fs.unlinkSync(paths.pid); } catch (_e) {}
    process.stdout.write(`${JSON.stringify({ type: 'bot_stopped', name, ok: true, pid, reason: 'not_running' })}\n`);
    return;
  }

  try {
    process.kill(pid, signal);
  } catch (err) {
    die(`Failed to signal pid=${pid}: ${err?.message ?? String(err)}`);
  }

  const ok = await waitForExit(pid, waitMs);
  if (!ok && signal !== 'SIGKILL') {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (_e) {}
  }

  try { fs.unlinkSync(paths.pid); } catch (_e) {}
  process.stdout.write(`${JSON.stringify({ type: 'bot_stopped', name, ok: true, pid, signal })}\n`);
}

async function restartBot({ name, waitMs = 2000 }) {
  const paths = statePaths(name);
  const cfg = readJson(paths.json);
  if (!cfg) die(`Missing state: ${paths.json}\nHint: run start-maker/start-taker first.`);
  await stopBot({ name, waitMs });
  startBot({
    name,
    role: cfg.role,
    store: cfg.store,
    scPort: cfg.sc_port,
    logPath: cfg.log,
    receiptsDb: cfg.receipts_db,
    passthru: cfg.args_passthru,
  });
}

function status({ name = '' } = {}) {
  mkdirp(stateDir);
  const list = fs.readdirSync(stateDir).filter((f) => f.endsWith('.json'));
  const rows = [];
  for (const f of list) {
    const cfg = readJson(path.join(stateDir, f));
    if (!cfg?.name) continue;
    if (name && cfg.name !== name) continue;
    const paths = statePaths(cfg.name);
    const pidText = fs.existsSync(paths.pid) ? fs.readFileSync(paths.pid, 'utf8').trim() : '';
    const pid = pidText ? Number.parseInt(pidText, 10) : null;
    rows.push({
      name: cfg.name,
      role: cfg.role,
      store: cfg.store,
      sc_port: cfg.sc_port,
      pid: pid && Number.isFinite(pid) ? pid : null,
      alive: pid && Number.isFinite(pid) ? isAlive(pid) : false,
      log: cfg.log || null,
      receipts_db: cfg.receipts_db || null,
      started_at: cfg.started_at || null,
    });
  }
  process.stdout.write(`${JSON.stringify({ type: 'bot_status', bots: rows }, null, 2)}\n`);
}

async function main() {
  const { args, flags, passthru } = parseArgs(process.argv.slice(2));
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (cmd === 'start-maker' || cmd === 'start-taker') {
    const name = requireFlag(flags, 'name');
    const store = requireFlag(flags, 'store');
    const scPort = maybeInt(flags, 'sc-port', null);
    if (!scPort) die('Missing --sc-port');
    const role = cmd === 'start-maker' ? 'maker' : 'taker';
    const log = maybeFlag(flags, 'log', '');
    const receiptsDb = maybeFlag(flags, 'receipts-db', '');
    startBot({ name, role, store, scPort, logPath: log, receiptsDb, passthru });
    return;
  }

  if (cmd === 'stop') {
    const name = requireFlag(flags, 'name');
    const signal = maybeFlag(flags, 'signal', 'SIGTERM');
    const waitMs = maybeInt(flags, 'wait-ms', 2000);
    await stopBot({ name, signal, waitMs });
    return;
  }

  if (cmd === 'restart') {
    const name = requireFlag(flags, 'name');
    const waitMs = maybeInt(flags, 'wait-ms', 2000);
    await restartBot({ name, waitMs });
    return;
  }

  if (cmd === 'status') {
    const name = maybeFlag(flags, 'name', '');
    status({ name });
    return;
  }

  die(`Unknown command: ${cmd}\n\n${usage()}`);
}

main().catch((err) => die(err?.stack || err?.message || String(err)));
