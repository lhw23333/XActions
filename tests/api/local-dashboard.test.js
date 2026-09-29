// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import { beforeAll, afterAll, beforeEach, afterEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

const keys = ['NODE_ENV', 'XACTIONS_LOCAL_DASHBOARD'];
const originalEnvironment = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let server;
let io;
let baseUrl;

beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  delete process.env.XACTIONS_LOCAL_DASHBOARD;
  const { createApp } = await import('../../api/server.js');
  ({ httpServer: server, io } = createApp({ rateLimiting: false }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => io.close(resolve));
  for (const key of keys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  process.env.XACTIONS_LOCAL_DASHBOARD = '1';
});

afterEach(() => {
  for (const key of keys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

function request(path, headers = {}) {
  return fetch(`${baseUrl}${path}`, { headers, redirect: 'manual' });
}

describe('Explicit local dashboard browsing', () => {
  it('reports local browsing without creating account credentials', async () => {
    const response = await request('/js/runtime-config.js');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(await response.text(), 'window.XACTIONS_LOCAL_DASHBOARD = true;\n');
  });

  it('redirects both login URLs directly to the dashboard', async () => {
    for (const path of ['/login', '/login.html']) {
      const response = await request(path);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/dashboard');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const dashboard = await request('/dashboard');
    assert.equal(dashboard.headers.get('location'), '/');
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('cache-control'), 'no-store');
    assert.match(await home.text(), /Dashboard - XActions/);
    const config = await request('/js/config.js');
    assert.equal(config.headers.get('cache-control'), 'no-store');
  });

  it('keeps account and administrator APIs protected', async () => {
    for (const path of ['/api/user/me', '/api/user/profile', '/api/admin/licenses']) {
      const response = await request(path);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'No token provided' });
    }
  });

  it('rejects foreign Host headers even with forwarded loopback headers', async () => {
    // Native HTTP preserves Host verbatim; fetch can replace this header.
    const status = await new Promise((resolve, reject) => {
      const outgoing = httpRequest(`${baseUrl}/js/runtime-config.js`, {
        headers: {
          Host: 'attacker.example',
          'X-Forwarded-Host': new URL(baseUrl).host,
          'X-Forwarded-For': '127.0.0.1',
        },
      }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      outgoing.on('error', reject);
      outgoing.end();
    });
    assert.equal(status, 403);
  });

  it('rejects foreign, null, and different-port browser origins', async () => {
    for (const origin of ['https://attacker.example', 'null', 'http://127.0.0.1:1']) {
      const response = await request('/api/health', { Origin: origin });
      assert.equal(response.status, 403);
    }
  });

  it('accepts same-origin requests without exposing the authenticated API', async () => {
    const response = await request('/api/health', { Origin: baseUrl });
    assert.equal(response.status, 200);
    const account = await request('/api/user/me', { Origin: baseUrl });
    assert.equal(account.status, 401);
  });

  it('rejects cross-site browser requests without an Origin', async () => {
    const response = await request('/api/health', { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(response.status, 403);
  });

  it('keeps normal login when local mode is disabled', async () => {
    delete process.env.XACTIONS_LOCAL_DASHBOARD;
    const response = await request('/js/runtime-config.js');
    assert.equal(await response.text(), 'window.XACTIONS_LOCAL_DASHBOARD = false;\n');
    const login = await request('/login');
    assert.equal(login.status, 200);
    assert.match(await login.text(), /Sign in to XActions/);
  });

  it('never enables local browsing in production', async () => {
    process.env.NODE_ENV = 'production';
    const response = await request('/js/runtime-config.js');
    assert.equal(await response.text(), 'window.XACTIONS_LOCAL_DASHBOARD = false;\n');
    const login = await request('/login');
    assert.equal(login.status, 200);
    const account = await request('/api/user/me');
    assert.equal(account.status, 401);
  });
});
