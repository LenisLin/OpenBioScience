/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA and reverse-proxies /api/*, /ws, and
 * /api/stt/stream to DeepOrganiser Core. OpenBioScience hides the app-level
 * login flow, so the WebUI host answers auth status probes locally while the
 * rest of the API remains proxied to the backend. /ws and /api/stt/stream are
 * WebSocket/stream upgrades spliced at TCP level; /api/stt/stream is the STT
 * streaming endpoint.
 *
 * Design: Node native http + serve-handler. No Express. No business routes.
 */

import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import net, { type Socket } from 'node:net';
import serveHandler from 'serve-handler';

export type StaticServerOptions = {
  staticDir: string;
  backendPort: number;
  port?: number;
  allowRemote?: boolean;
};

export type StaticServerHandle = {
  port: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};

const DEFAULT_PORT = 25808;

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function forwardToBackend(req: IncomingMessage, res: ServerResponse, backendPort: number): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'BACKEND_UNREACHABLE' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendNoLoginAuthResponse(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (pathname === '/api/auth/user' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      user: {
        id: 'local_user',
        username: 'OpenBioScience',
      },
    });
    return true;
  }

  if (pathname === '/api/auth/status' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      needs_setup: false,
      user_count: 1,
      is_authenticated: true,
    });
    return true;
  }

  if (pathname === '/login' || pathname === '/logout') {
    sendJson(res, 200, { success: true });
    return true;
  }

  return false;
}

// Max bytes we peek before forcing a routing decision. An HTTP request-line
// on its own is typically < 100 bytes; a full header block is < 2 KB. If we
// haven't seen a newline after 4 KB the client is sending something weird —
// hand it to the internal HTTP server and let it return 400.
const PEEK_LIMIT_BYTES = 4096;

/**
 * Splice `client` to a TCP endpoint on `targetPort`. Any bytes already read
 * from `client` during peek are replayed to the upstream as the first write,
 * so the endpoint sees the full HTTP request as-sent.
 */
function spliceToTcpEndpoint(client: Socket, targetPort: number, initialBytes: Buffer): void {
  client.setNoDelay(true);
  client.setKeepAlive(true);
  client.setTimeout(0);
  const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true);
  upstream.once('connect', () => {
    if (initialBytes.length > 0) upstream.write(initialBytes);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const tearDown = (): void => {
    client.destroy();
    upstream.destroy();
  };
  upstream.on('error', tearDown);
  client.on('error', tearDown);
  upstream.on('close', tearDown);
  client.on('close', tearDown);
}

/**
 * Decide routing from the first chunk of an incoming HTTP connection:
 *  - `true`  → `GET /ws[...] HTTP/1.x` or `GET /api/stt/stream[...] HTTP/1.x` (WebSocket/stream upgrades), splice to backend
 *  - `false` → any other HTTP method / path, hand to internal HTTP server
 *  - `null`  → need more bytes (no CRLF yet)
 *
 * We only check the request-line; `Upgrade: websocket` is not strictly
 * required — the backend will reject a non-upgrade GET on these paths on its own.
 * Keeping the rule simple means we can decide after the first ~50 bytes
 * instead of waiting for the full header block.
 */
function peekWsRoute(buf: Buffer): boolean | null {
  const newlineIdx = buf.indexOf(0x0a); // \n
  if (newlineIdx < 0) return null;
  const firstLine = buf.slice(0, newlineIdx).toString('ascii');
  return /^GET\s+\/(?:ws|api\/stt\/stream)(?:\?[^\s]*)?\s+HTTP\/1\.[01]\r?$/.test(firstLine);
}

function isStaticAssetRequest(url: string): boolean {
  const pathname = new URL(url, 'http://localhost').pathname;
  const lastSegment = pathname.split('/').pop() ?? '';
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/pwa/') ||
    pathname.startsWith('/pet/') ||
    lastSegment.includes('.')
  );
}

export function getSpaDocumentCacheHeaders(url: string | undefined): Record<string, string> | null {
  if (!url || isStaticAssetRequest(url)) {
    return null;
  }

  return {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

function setSpaDocumentCacheHeaders(req: IncomingMessage, res: ServerResponse): void {
  const headers = getSpaDocumentCacheHeaders(req.url);
  if (!headers) return;

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';

  // The HTTP server listens only on loopback — user traffic hits the outer
  // net.Server first. We route to this server for everything except WS
  // upgrades and STT stream upgrades, which go straight to the backend via a raw TCP splice.
  //
  // Why two listeners instead of using `http.Server`'s native `upgrade` event:
  // bun 1.3's http-compat layer does not faithfully forward writes on the
  // socket delivered to the `upgrade` handler, so the backend's 101 response
  // never reaches the browser (see #2824). Making the outer listener pure
  // TCP avoids touching that code path on both bun and node.
  const http_server: Server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      if (sendNoLoginAuthResponse(req, res)) {
        return;
      }

      // /api/* — reverse proxy to backend. Auth status endpoints are handled
      // above because OpenBioScience no longer asks users to sign in before use.
      if (req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
        forwardToBackend(req, res, opts.backendPort);
        return;
      }

      // Static files + SPA fallback. Asset-like URLs must not fall back to
      // index.html: stale lazy chunks should fail as 404 instead of returning
      // unrelated HTML/JS that can surface as visible text in the renderer.
      setSpaDocumentCacheHeaders(req, res);
      const rewrites = isStaticAssetRequest(req.url) ? [] : [{ source: '**', destination: '/index.html' }];
      await serveHandler(req, res, {
        public: opts.staticDir,
        rewrites,
      });
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      } else {
        res.destroy();
      }
    }
  });

  // Internal HTTP server — 127.0.0.1 ephemeral port, never visible to the user.
  await new Promise<void>((resolve, reject) => {
    http_server.once('error', reject);
    http_server.listen(0, '127.0.0.1', () => {
      http_server.off('error', reject);
      resolve();
    });
  });
  const internalPort = (http_server.address() as { port: number } | null)?.port;
  if (!internalPort) {
    throw new Error('internal HTTP server failed to bind to a port');
  }

  // User-facing listener: inspect the first line of every TCP connection and
  // route to either the backend (for /ws and /api/stt/stream upgrades) or the internal HTTP
  // server (everything else). Both routes use raw TCP splice — no reliance
  // on http.Server's upgrade event.
  const tcp_server = net.createServer((client: Socket) => {
    let peeked = Buffer.alloc(0);
    let settled = false;
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      client.removeListener('data', onData);
      client.removeListener('error', onEarlyError);
      client.removeListener('end', onEarlyEnd);
    };
    const onData = (chunk: Buffer): void => {
      peeked = Buffer.concat([peeked, chunk]);
      const decision = peekWsRoute(peeked);
      if (decision === null && peeked.length < PEEK_LIMIT_BYTES) return;
      cleanup();
      const target = decision === true ? opts.backendPort : internalPort;
      spliceToTcpEndpoint(client, target, peeked);
    };
    const onEarlyError = (): void => {
      cleanup();
      client.destroy();
    };
    const onEarlyEnd = (): void => {
      // Client closed before we saw a request line — nothing to route.
      cleanup();
      client.destroy();
    };
    client.on('data', onData);
    client.on('error', onEarlyError);
    client.on('end', onEarlyEnd);
  });

  await new Promise<void>((resolve, reject) => {
    tcp_server.once('error', reject);
    tcp_server.listen(port, host, () => {
      tcp_server.off('error', reject);
      resolve();
    });
  });

  const actualPort = (tcp_server.address() as { port: number } | null)?.port ?? port;
  const lanIP = allowRemote ? (getLanIP() ?? undefined) : undefined;
  const localUrl = `http://127.0.0.1:${actualPort}`;
  const networkUrl = lanIP ? `http://${lanIP}:${actualPort}` : undefined;

  return {
    port: actualPort,
    url: networkUrl ?? localUrl,
    localUrl,
    networkUrl,
    lanIP,
    stop: () =>
      new Promise<void>((resolve) => {
        tcp_server.close(() => {
          http_server.close(() => resolve());
        });
      }),
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}
