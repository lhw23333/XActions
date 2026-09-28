// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Compatibility facade for the public Scraper client.
 *
 * The client API modules predate TwitterHttpClient and operate on a tiny
 * `{ get, post }` transport contract. Keep that contract at the boundary while
 * routing every request through the newer client so signing, retries, proxy
 * support, rate-limit handling, and query-ID refresh have one implementation.
 *
 * @author nich (@nichxbt)
 * @license Apache-2.0
 */

import {
  POST_QUERY_OPERATIONS,
  DEFAULT_FEATURES,
} from '../scrapers/twitter/http/endpoints.js';
import { TwitterHttpClient } from '../scrapers/twitter/http/client.js';

const GRAPHQL_PATH = /^\/i\/api\/graphql\/([^/]+)\/([^/]+)$/;

function serializeCookies(cookies) {
  if (typeof cookies === 'string') return cookies;
  if (Array.isArray(cookies)) {
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  }
  return '';
}

function parseGraphqlUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const match = parsed.pathname.match(GRAPHQL_PATH);
  if (!match) return null;

  let variables = {};
  let features = DEFAULT_FEATURES;
  try {
    variables = JSON.parse(parsed.searchParams.get('variables') || '{}');
  } catch {
    variables = {};
  }
  try {
    features = JSON.parse(parsed.searchParams.get('features') || 'null') || DEFAULT_FEATURES;
  } catch {
    features = DEFAULT_FEATURES;
  }

  return {
    queryId: match[1],
    operationName: match[2],
    variables,
    features,
  };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

function wrapGraphqlResult(result) {
  return {
    data: result?.data,
    errors: result?.errors,
  };
}

function normalizeHeaders(headers = {}) {
  const normalized = { ...headers };
  if (normalized.contentType && !normalized['Content-Type']) {
    normalized['Content-Type'] = normalized.contentType;
  }
  delete normalized.contentType;
  return normalized;
}

/**
 * Transport facade consumed by `src/client/api/*`.
 */
export class TwitterHttpFacade {
  /**
   * @param {object} [options]
   * @param {string|Array<{name: string, value: string}>} [options.cookies]
   * @param {Function} [options.fetch]
   * @param {Function} [options.transform]
   */
  constructor(options = {}) {
    const baseFetch = options.fetch || globalThis.fetch;
    const fetch = options.transform
      ? (url, init) => baseFetch(url, options.transform({ ...init }) || init)
      : baseFetch;

    this._cookies = serializeCookies(options.cookies);
    this.client = new TwitterHttpClient({
      ...options,
      fetch,
      cookies: this._cookies || undefined,
    });
  }

  isAuthenticated() {
    return this.client.isAuthenticated();
  }

  setCookies(cookies) {
    this._cookies = serializeCookies(cookies);
    this.client.clearCookies();
    this.client.setCookies(this._cookies);
  }

  clearCookies() {
    this._cookies = '';
    this.client.clearCookies();
  }

  getCookies() {
    if (!this._cookies) return [];
    return this._cookies.split('; ').map((pair) => {
      const [name, ...rest] = pair.split('=');
      return { name: name.trim(), value: rest.join('=') };
    });
  }

  async _graphql(url, body, method) {
    const parsed = parseGraphqlUrl(url);
    if (!parsed) return null;

    const payload = parseBody(body) || {};
    const queryId = payload.queryId || parsed.queryId;
    const variables = payload.variables || parsed.variables;
    const features = payload.features || parsed.features;
    const mutation = method === 'POST' && !POST_QUERY_OPERATIONS.has(parsed.operationName);

    const result = await this.client.graphql(
      queryId,
      parsed.operationName,
      variables,
      { features, mutation },
    );

    return wrapGraphqlResult(result);
  }

  async get(url) {
    const graphql = await this._graphql(url, null, 'GET');
    if (graphql) return graphql;
    return this.client.request(url, { method: 'GET' });
  }

  async post(url, body, extraHeaders = {}) {
    const graphql = await this._graphql(url, body, 'POST');
    if (graphql) return graphql;
    return this.client.request(url, {
      method: 'POST',
      body,
      headers: normalizeHeaders(extraHeaders),
    });
  }
}
