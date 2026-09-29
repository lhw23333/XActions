// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
// @author nich (@nichxbt)
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import twitterRoutes from '../../api/routes/twitter.js';

const environmentKeys = [
  'NODE_ENV', 'TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET', 'JWT_SECRET',
  'API_URL', 'FRONTEND_URL', 'VERCEL_URL',
];
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
const signingKey = 'oauth-route-test-signing-key';
const unavailable = {
  error: 'Sign in with X is not configured on this server. Contact the server administrator to enable it.',
  code: 'OAUTH_NOT_CONFIGURED',
};
let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use('/api/twitter', twitterRoutes);
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

beforeEach(() => {
  for (const key of environmentKeys) delete process.env[key];
  process.env.NODE_ENV = 'development';
  process.env.TWITTER_CLIENT_ID = 'oauth-test-client';
  process.env.TWITTER_CLIENT_SECRET = 'oauth-test-client-secret';
  process.env.JWT_SECRET = signingKey;
});

afterEach(() => {
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

// Keep every HTTP request local, including responses that redirect to X.
function request(path, accept = 'application/json') {
  return fetch(`${baseUrl}/api/twitter${path}`, {
    headers: { Accept: accept },
    redirect: 'manual',
  });
}

describe('X OAuth login configuration', () => {
  for (const [label, key, value] of [
    ['missing client ID', 'TWITTER_CLIENT_ID', undefined],
    ['missing client secret', 'TWITTER_CLIENT_SECRET', undefined],
    ['missing signing key', 'JWT_SECRET', undefined],
    ['blank client ID', 'TWITTER_CLIENT_ID', '  '],
    ['blank client secret', 'TWITTER_CLIENT_SECRET', '\t '],
    ['example client ID', 'TWITTER_CLIENT_ID', ' your_twitter_client_id '],
    ['example client secret', 'TWITTER_CLIENT_SECRET', ' your_twitter_client_secret '],
  ]) {
    it(`returns a safe 503 JSON response for ${label}`, async () => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      const response = await request('/login');
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('location'), null);
      assert.deepEqual(await response.json(), unavailable);
    });
  }

  it('redirects an unconfigured browser to the same-origin login page', async () => {
    delete process.env.TWITTER_CLIENT_ID;
    process.env.FRONTEND_URL = 'https://configured-frontend.example';
    const response = await request('/login', 'text/html,application/xhtml+xml,*/*;q=0.8');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/login?error=oauth_not_configured');
  });

  it('returns a configured authorization URL as JSON with signed state and S256 PKCE', async () => {
    process.env.TWITTER_CLIENT_ID = ' trimmed-client-id ';
    process.env.TWITTER_CLIENT_SECRET = ' trimmed-client-secret ';
    const response = await request('/login');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['authUrl']);
    const url = new URL(body.authUrl);
    assert.equal(url.origin + url.pathname, 'https://x.com/i/oauth2/authorize');
    assert.equal(url.searchParams.get('client_id'), 'trimmed-client-id');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3001/api/twitter/callback');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const state = jwt.verify(url.searchParams.get('state'), signingKey);
    assert.equal(state.flow, 'login');
    assert.equal(state.exp - state.iat, 600);
    assert.match(state.codeVerifier, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(state.codeVerifier).digest('base64url'));
    assert.equal(url.searchParams.has('code_verifier'), false);
    assert.equal(body.authUrl.includes(process.env.TWITTER_CLIENT_SECRET.trim()), false);

    const next = await request('/login');
    const nextUrl = new URL((await next.json()).authUrl);
    assert.notEqual(nextUrl.searchParams.get('state'), url.searchParams.get('state'));
    assert.notEqual(nextUrl.searchParams.get('code_challenge'), url.searchParams.get('code_challenge'));
  });

  it('preserves the browser redirect when configured, including wildcard Accept', async () => {
    process.env.API_URL = 'http://127.0.0.1:3001/';
    for (const accept of ['text/html', '*/*']) {
      const response = await request('/login', accept);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const url = new URL(response.headers.get('location'));
      assert.equal(url.origin, 'https://x.com');
      assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:3001/api/twitter/callback');
    }
  });

  it('sends a missing-parameter callback to the API origin by default', async () => {
    const response = await request('/callback');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'http://localhost:3001/login?error=missing_params');
  });

  it('honors a configured frontend and rejects an invalid state before external requests', async () => {
    process.env.FRONTEND_URL = 'https://configured-frontend.example/';
    const response = await request('/callback?code=unused-test-code&state=invalid');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://configured-frontend.example/login?error=invalid_state');
  });

  it('keeps account connection protected without a bearer token', async () => {
    const response = await request('/connect');
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'No token provided' });
  });
});
