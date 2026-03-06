/**
 * Proxy performance benchmarks
 *
 * Run with:  npm run bench
 *
 * These benchmarks measure the Node.js-side latency of the two hottest
 * paths in ClaudeProxyManager:
 *
 *   1. findAvailablePort  — scanned on every cold proxy start
 *   2. waitForHealthy     — polled until the Python uvicorn process is up
 *
 * The benchmarks spin up real TCP / HTTP servers so the numbers reflect
 * actual syscall + network-stack overhead, not just computation time.
 */

import net from 'node:net';
import http from 'node:http';
import { bench, describe, afterAll } from 'vitest';

// ─── helpers ────────────────────────────────────────────────────────────────

const HOST = '127.0.0.1';
const PORT_BASE = 19200; // far from the proxy range to avoid collisions

/** Bind a TCP server to `port` and keep it open until `cleanup` is called. */
function occupyPort(port: number): Promise<{ cleanup: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, HOST, () => {
      resolve({
        cleanup: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

/** Check whether `port` is free (mirrors the extracted helper in claude-proxy-manager). */
function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

/** Sequential port scan (old algorithm). */
async function findAvailablePortSerial(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await checkPortAvailable(port)) return port;
  }
  throw new Error('no port available');
}

/** Parallel batch port scan (new algorithm). */
async function findAvailablePortParallel(
  start: number,
  end: number,
  batchSize = 8,
): Promise<number> {
  for (let batchStart = start; batchStart <= end; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize - 1, end);
    const ports = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);
    const results = await Promise.all(ports.map(checkPortAvailable));
    for (let i = 0; i < results.length; i++) {
      if (results[i]) return ports[i];
    }
  }
  throw new Error('no port available');
}

// ─── port-finding benchmarks ─────────────────────────────────────────────────

describe('findAvailablePort: first port free (best case)', () => {
  bench('serial', async () => {
    await findAvailablePortSerial(PORT_BASE + 100, PORT_BASE + 139);
  });

  bench('parallel (batch=8)', async () => {
    await findAvailablePortParallel(PORT_BASE + 100, PORT_BASE + 139);
  });
});

describe('findAvailablePort: first 7 ports occupied (skip one batch)', () => {
  const occupiedCleanups: Array<() => Promise<void>> = [];

  // occupy ports PORT_BASE+200 … PORT_BASE+206  (7 ports, fills the first batch)
  for (let i = 0; i < 7; i++) {
    let cleanup: () => Promise<void>;
    bench.skipIf(false)(
      `setup:${i}`, // not a real benchmark – used as a beforeAll workaround
      async () => {},
    );
  }

  // We use a standalone describe so we can rely on afterAll
  afterAll(async () => {
    await Promise.all(occupiedCleanups.map((fn) => fn()));
  });

  bench('serial — 7 busy ports', async () => {
    const cleanups: Array<() => Promise<void>> = [];
    for (let i = 0; i < 7; i++) {
      const { cleanup } = await occupyPort(PORT_BASE + 200 + i);
      cleanups.push(cleanup);
    }
    try {
      await findAvailablePortSerial(PORT_BASE + 200, PORT_BASE + 239);
    } finally {
      await Promise.all(cleanups.map((fn) => fn()));
    }
  }, { time: 1000 });

  bench('parallel (batch=8) — 7 busy ports', async () => {
    const cleanups: Array<() => Promise<void>> = [];
    for (let i = 0; i < 7; i++) {
      const { cleanup } = await occupyPort(PORT_BASE + 300 + i);
      cleanups.push(cleanup);
    }
    try {
      await findAvailablePortParallel(PORT_BASE + 300, PORT_BASE + 339);
    } finally {
      await Promise.all(cleanups.map((fn) => fn()));
    }
  }, { time: 1000 });
});

// ─── waitForHealthy: poll-strategy benchmarks ────────────────────────────────

/**
 * Simulate a proxy that becomes ready after `readyAfterMs` milliseconds.
 * Returns the total wall-clock time until the poller detects it.
 */
async function measureHealthCheckTime(
  readyAfterMs: number,
  pollStrategy: (baseUrl: string, deadline: number) => Promise<void>,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let serverReady = false;
    const server = http.createServer((_req, res) => {
      if (serverReady) {
        res.writeHead(200);
        res.end('ok');
      } else {
        res.writeHead(503);
        res.end('not ready');
      }
    });

    server.listen(0, HOST, async () => {
      const { port } = server.address() as net.AddressInfo;
      const baseUrl = `http://${HOST}:${port}`;

      setTimeout(() => {
        serverReady = true;
      }, readyAfterMs);

      const t0 = Date.now();
      try {
        await pollStrategy(baseUrl, t0 + 10_000);
        resolve(Date.now() - t0);
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

async function pollFixed250(baseUrl: string, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/`);
      if (r.ok) return;
    } catch { /* ignore */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error('timeout');
}

async function pollExpBackoff(baseUrl: string, deadline: number): Promise<void> {
  let delay = 50;
  const MAX_DELAY = 400;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/`);
      if (r.ok) return;
    } catch { /* ignore */ }
    await new Promise((res) => setTimeout(res, delay));
    delay = Math.min(Math.ceil(delay * 1.6), MAX_DELAY);
  }
  throw new Error('timeout');
}

describe('waitForHealthy: time-to-detect (proxy ready after N ms)', () => {
  bench('fixed-250ms poll, proxy ready after 100ms', async () => {
    await measureHealthCheckTime(100, pollFixed250);
  }, { iterations: 5 });

  bench('exp-backoff poll,  proxy ready after 100ms', async () => {
    await measureHealthCheckTime(100, pollExpBackoff);
  }, { iterations: 5 });

  bench('fixed-250ms poll, proxy ready after 500ms', async () => {
    await measureHealthCheckTime(500, pollFixed250);
  }, { iterations: 5 });

  bench('exp-backoff poll,  proxy ready after 500ms', async () => {
    await measureHealthCheckTime(500, pollExpBackoff);
  }, { iterations: 5 });

  bench('fixed-250ms poll, proxy ready after 1500ms', async () => {
    await measureHealthCheckTime(1500, pollFixed250);
  }, { iterations: 3 });

  bench('exp-backoff poll,  proxy ready after 1500ms', async () => {
    await measureHealthCheckTime(1500, pollExpBackoff);
  }, { iterations: 3 });
});
