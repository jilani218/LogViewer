#!/usr/bin/env node
/*
 * adb-bridge — tiny zero-dependency Node server that exposes adb to the
 * Logcat Viewer HTML page. Run it once, then open the HTML file (or
 * http://localhost:8037/) and you'll get a device picker + live streaming.
 *
 * Usage:
 *   node adb-bridge.js                 # default port 8037
 *   node adb-bridge.js --port 9000
 *   ADB=/path/to/adb node adb-bridge.js
 *
 * Endpoints (all CORS-open to localhost):
 *   GET  /                              -> serves logcat.html (if next to this file)
 *   GET  /devices                       -> { devices: [{serial, state, model, ...}] }
 *   GET  /stream?serial=&buffer=&format -> Server-Sent Events stream of log lines
 *   POST /clear?serial=                 -> adb logcat -c on the device
 *   GET  /health                        -> { ok: true, adb: "<version>" }
 */

const http        = require('http');
const fs          = require('fs');
const path        = require('path');
const { spawn, execFile } = require('child_process');

// ---- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = parseInt(arg('--port', process.env.PORT || '8037'), 10);
const ADB  = process.env.ADB || arg('--adb', 'adb');
const HTML_PATH = path.join(__dirname, 'logcat.html');

// ---- helpers ---------------------------------------------------------------
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function json(res, code, obj) {
  setCors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function adb(args, cb) {
  execFile(ADB, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
    cb(err, (stdout || '').toString(), (stderr || '').toString());
  });
}

function parseDevices(stdout) {
  const out = [];
  const lines = stdout.split(/\r?\n/).slice(1); // drop "List of devices attached"
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const serial = parts.shift();
    const state  = parts.shift() || 'unknown';
    const props  = {};
    for (const p of parts) {
      const i = p.indexOf(':');
      if (i > 0) props[p.slice(0, i)] = p.slice(i + 1);
    }
    out.push({ serial, state, ...props });
  }
  return out;
}

// ---- request handler -------------------------------------------------------
const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://x');

  // Serve the HTML at the same origin (avoids any CORS / private-network nags)
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/logcat.html')) {
    fs.readFile(HTML_PATH, (err, data) => {
      if (err) { res.writeHead(404); return res.end('logcat.html not found next to adb-bridge.js'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/readme.md' || url.pathname === '/README.md')) {
    fs.readFile(path.join(__dirname, 'README.md'), (err, data) => {
      if (err) { res.writeHead(404); return res.end('README.md not found'); }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return adb(['version'], (err, stdout) => {
      if (err) return json(res, 500, { ok: false, error: 'adb not found', detail: String(err.message || err) });
      json(res, 200, { ok: true, adb: stdout.split('\n')[0].trim() });
    });
  }

  if (req.method === 'GET' && url.pathname === '/devices') {
    return adb(['devices', '-l'], (err, stdout, stderr) => {
      if (err) return json(res, 500, { error: 'adb failed', detail: stderr || String(err.message || err) });
      json(res, 200, { devices: parseDevices(stdout) });
    });
  }

  if ((req.method === 'POST' || req.method === 'GET') && url.pathname === '/clear') {
    const serial = url.searchParams.get('serial');
    const a = ['logcat', '-c'];
    if (serial) a.unshift('-s', serial);
    return adb(a, (err, _o, stderr) => {
      if (err) return json(res, 500, { ok: false, error: stderr || String(err) });
      json(res, 200, { ok: true });
    });
  }

  if (req.method === 'GET' && url.pathname === '/stream') {
    const serial = url.searchParams.get('serial');
    const buffer = url.searchParams.get('buffer') || 'main';   // main|system|crash|events|radio|all
    const format = url.searchParams.get('format') || 'threadtime';
    const filter = url.searchParams.get('filter') || '';        // e.g. "MyTag:V *:S"

    const a = [];
    if (serial) a.push('-s', serial);
    a.push('logcat', '-v', format, '-b', buffer);
    if (filter) a.push(...filter.split(/\s+/));

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: meta\ndata: ${JSON.stringify({ serial, buffer, format })}\n\n`);

    let child;
    try {
      child = spawn(ADB, a, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'spawn failed', detail: String(e) })}\n\n`);
      return res.end();
    }

    // Heartbeat to keep proxies / browsers from closing idle SSE connections
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);

    let buf = '';
    child.stdout.on('data', chunk => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop();
      // Batch flush to one write
      let out = '';
      for (const line of lines) {
        if (!line) continue;
        out += `data: ${line.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}\n\n`;
      }
      if (out) try { res.write(out); } catch {}
    });
    child.stderr.on('data', chunk => {
      const msg = chunk.toString('utf8').trim();
      if (msg) try { res.write(`event: stderr\ndata: ${msg.replace(/\n/g, ' ')}\n\n`); } catch {}
    });
    child.on('close', code => {
      clearInterval(ping);
      try { res.write(`event: end\ndata: ${code}\n\n`); res.end(); } catch {}
    });
    child.on('error', err => {
      clearInterval(ping);
      try { res.write(`event: error\ndata: ${JSON.stringify({ message: String(err.message || err) })}\n\n`); res.end(); } catch {}
    });

    req.on('close', () => {
      clearInterval(ping);
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1500);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`adb-bridge   ▸  http://localhost:${PORT}/`);
  console.log(`             ▸  endpoints:  /devices  /stream  /clear  /health`);
  console.log(`             ▸  using adb:  ${ADB}`);
  adb(['version'], (err, stdout) => {
    if (err) console.warn(`             ⚠  '${ADB}' not callable yet — install platform-tools or set ADB=…`);
    else     console.log(`             ▸  ${stdout.split('\n')[0].trim()}`);
  });
});

process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
