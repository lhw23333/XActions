// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Discover high-signal Web3 accounts and follow them gradually.
 *
 * The task searches recent Top results, resolves authors to profiles, keeps a
 * durable queue, and follows at most a small number of accounts per interval.
 * It is dry-run by default; pass --execute to enable follow mutations.
 *
 * @author nich (@nichxbt)
 * @license Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TwitterHttpClient } from '../src/scrapers/twitter/http/client.js';
import { searchTweets } from '../src/scrapers/twitter/http/search.js';
import { scrapeProfile } from '../src/scrapers/twitter/http/profile.js';
import { followByUsername } from '../src/scrapers/twitter/http/engagement.js';
import { RateLimitError, AuthError } from '../src/scrapers/twitter/http/errors.js';

const DEFAULT_STATE_FILE = path.join(os.homedir(), '.xactions', 'web3-hot-account-follow.json');
const DEFAULT_COOKIE_FILE = path.join(os.homedir(), '.xactions', 'cookies.json');
const DEFAULT_QUERIES = [
  'web3 founder OR blockchain founder',
  'crypto CEO OR exchange CEO',
  'DeFi OR onchain OR smart money',
  'crypto trader OR bitcoin trader',
  'web3 media OR crypto research',
];
const RELEVANCE_PATTERN = /web3|crypto|blockchain|bitcoin|ethereum|defi|onchain|founder|co-founder|ceo|cto|trader|investor|protocol|exchange|media|news|research|analytics/i;
const RECENT_MS = 7 * 24 * 60 * 60_000;
const DISCOVERY_MS = 24 * 60 * 60_000;
const FOLLOW_WINDOW_MS = 24 * 60 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = {
    cookieFile: DEFAULT_COOKIE_FILE,
    stateFile: DEFAULT_STATE_FILE,
    intervalMinutes: 10,
    perCycle: 1,
    maxPerDay: 100,
    minFollowers: 10_000,
    searchLimit: 30,
    profileLimit: 40,
    delayMs: 300_000,
    execute: false,
    once: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--once') options.once = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--cookie-file') options.cookieFile = argv[++i];
    else if (arg === '--state-file') options.stateFile = argv[++i];
    else if (arg === '--interval-minutes') options.intervalMinutes = Number(argv[++i]);
    else if (arg === '--per-cycle') options.perCycle = Number(argv[++i]);
    else if (arg === '--max-per-day') options.maxPerDay = Number(argv[++i]);
    else if (arg === '--min-followers') options.minFollowers = Number(argv[++i]);
    else if (arg === '--search-limit') options.searchLimit = Number(argv[++i]);
    else if (arg === '--profile-limit') options.profileLimit = Number(argv[++i]);
    else if (arg === '--delay-ms') options.delayMs = Number(argv[++i]);
  }

  options.intervalMinutes = Math.max(5, options.intervalMinutes || 10);
  options.perCycle = Math.min(3, Math.max(1, options.perCycle || 1));
  options.maxPerDay = Math.min(100, Math.max(1, options.maxPerDay || 100));
  options.searchLimit = Math.min(100, Math.max(5, options.searchLimit || 30));
  options.profileLimit = Math.min(100, Math.max(5, options.profileLimit || 40));
  options.delayMs = Math.max(60_000, options.delayMs || 300_000);
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/web3HotAccountFollow.js [options]

Discover recent high-signal Web3 accounts and follow them gradually.

Options:
  --once                 Run one discovery/follow cycle and exit
  --execute              Enable follow mutations (default is dry-run)
  --interval-minutes N   Delay between cycles, minimum 5 (default: 10)
  --per-cycle N          Max follows per cycle, maximum 3 (default: 1)
  --max-per-day N        Rolling 24h follow cap, maximum 100 (default: 100)
  --min-followers N      Minimum profile followers (default: 10000)
  --search-limit N       Top tweets per query (default: 30)
  --profile-limit N      Max candidate profiles to inspect (default: 40)
  --delay-ms N           Delay between follows in one cycle (default: 300000)
  --cookie-file PATH     Cookie JSON/string file (default: ~/.xactions/cookies.json)
  --state-file PATH      Durable queue/state file (default: ~/.xactions/web3-hot-account-follow.json)
`);
}

function emptyState() {
  return {
    version: 1,
    updatedAt: null,
    lastDiscoveredAt: null,
    cooldownUntil: null,
    followTimes: [],
    queue: [],
    followed: {},
    failed: {},
  };
}

async function loadState(filePath) {
  try {
    const state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const result = {
      ...emptyState(),
      ...state,
      followTimes: Array.isArray(state.followTimes) ? state.followTimes : [],
      queue: Array.isArray(state.queue) ? state.queue : [],
      followed: state.followed && typeof state.followed === 'object' ? state.followed : {},
      failed: state.failed && typeof state.failed === 'object' ? state.failed : {},
    };
    return result;
  } catch {
    return emptyState();
  }
}

async function saveState(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function readCookieHeader(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
      }
      if (Array.isArray(parsed.cookies)) {
        return parsed.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
      }
    } catch {
      // A Netscape or raw cookie string is passed through for the HTTP client.
    }
    return raw.trim();
  } catch {
    return '';
  }
}

function signalScore(tweet) {
  const metrics = tweet.metrics || {};
  return (metrics.likes || 0) + (metrics.retweets || 0) * 2 + (metrics.replies || 0);
}

function collectCandidateSignals(tweets, query, signals, now = Date.now()) {
  for (const tweet of tweets) {
    const username = tweet.author?.username?.replace(/^@/, '').trim();
    const createdAt = Date.parse(tweet.createdAt);
    if (!username || !Number.isFinite(createdAt) || now - createdAt > RECENT_MS || createdAt > now) continue;
    const key = username.toLowerCase();
    const previous = signals.get(key) || { username, signal: 0, queries: [] };
    previous.signal += signalScore(tweet);
    if (!previous.queries.includes(query)) previous.queries.push(query);
    signals.set(key, previous);
  }
}

function profileScore(profile, signal) {
  const followerScore = Math.log10(Math.max(1, profile.followers || 0)) * 10;
  const relevanceBonus = RELEVANCE_PATTERN.test(`${profile.name} ${profile.bio}`) ? 20 : 0;
  const verifiedBonus = profile.verified ? 10 : 0;
  return Math.round(followerScore + Math.log10(Math.max(1, signal)) * 5 + relevanceBonus + verifiedBonus);
}

function isCandidate(profile, signal, options) {
  if (!profile?.username || profile.followers < options.minFollowers) return false;
  if (!RELEVANCE_PATTERN.test(`${profile.name} ${profile.bio}`)) return false;
  return signal > 0;
}

async function discover(client, state, options) {
  if (state.queue.length && Date.now() - Date.parse(state.lastDiscoveredAt) < DISCOVERY_MS) {
    console.log(`Using ${state.queue.length} saved candidates; discovery runs at most once per day.`);
    return 0;
  }
  const signals = new Map();

  for (const query of DEFAULT_QUERIES) {
    console.log(`Searching Top Web3 results: ${query}`);
    const tweets = await searchTweets(client, query, {
      type: 'Top',
      limit: options.searchLimit,
    });

    collectCandidateSignals(tweets, query, signals);
  }

  const rankedSignals = [...signals.values()]
    .filter((candidate) => !state.followed[candidate.username.toLowerCase()])
    .filter((candidate) => !state.failed[candidate.username.toLowerCase()])
    .sort((a, b) => b.signal - a.signal)
    .slice(0, options.profileLimit);

  const existing = new Set(state.queue.map((candidate) => candidate.username.toLowerCase()));
  let added = 0;

  for (const signal of rankedSignals) {
    try {
      const profile = await scrapeProfile(client, signal.username);
      if (!isCandidate(profile, signal.signal, options)) continue;
      const key = profile.username.toLowerCase();
      if (existing.has(key)) continue;

      state.queue.push({
        username: profile.username,
        id: profile.id,
        name: profile.name,
        bio: profile.bio,
        followers: profile.followers,
        signal: signal.signal,
        score: profileScore(profile, signal.signal),
        queries: signal.queries,
        discoveredAt: new Date().toISOString(),
      });
      existing.add(key);
      added++;
    } catch (error) {
      if (error instanceof RateLimitError || error.status === 429) throw error;
      console.log(`Skipped @${signal.username}: ${error.message}`);
    }
  }

  state.queue.sort((a, b) => b.score - a.score);
  state.queue = state.queue.slice(0, 200);
  state.lastDiscoveredAt = new Date().toISOString();
  console.log(`Discovery added ${added} candidates; queue size is ${state.queue.length}`);
  return added;
}

async function runCycle(client, state, options) {
  const discovered = await discover(client, state, options);
  state.followTimes = state.followTimes.filter((time) => Date.now() - Date.parse(time) < FOLLOW_WINDOW_MS);
  const remainingToday = Math.max(0, options.maxPerDay - state.followTimes.length);
  if (options.execute && Date.parse(state.cooldownUntil) > Date.now()) {
    console.log(`Follow endpoint cooling down until ${state.cooldownUntil}; skipping writes.`);
    await saveState(options.stateFile, state);
    return { discovered, selected: 0, followed: 0 };
  }
  const count = Math.min(options.perCycle, remainingToday, state.queue.length);
  const selected = state.queue.splice(0, count);

  if (selected.length === 0) {
    console.log(options.execute ? 'No followable candidates remain for this cycle.' : 'Dry-run: no candidates to preview.');
    await saveState(options.stateFile, state);
    return { discovered, selected: 0, followed: 0 };
  }

  let followed = 0;
  for (let i = 0; i < selected.length; i++) {
    const candidate = selected[i];
    if (!options.execute) {
      console.log(`[DRY RUN] Would follow @${candidate.username} (${candidate.followers} followers, score ${candidate.score})`);
      state.queue.push(candidate);
      continue;
    }

    try {
      await followByUsername(client, candidate.username);
      state.followed[candidate.username.toLowerCase()] = {
        followedAt: new Date().toISOString(),
        followers: candidate.followers,
        score: candidate.score,
      };
      state.followTimes.push(new Date().toISOString());
      followed++;
      console.log(`Followed @${candidate.username} (${state.followTimes.length}/${options.maxPerDay} in 24h)`);
    } catch (error) {
      if (error instanceof RateLimitError || error.status === 429) {
        state.queue.unshift(...selected.slice(i));
        state.cooldownUntil = new Date(Math.max(error.resetAt || 0, Date.now() + 60 * 60_000)).toISOString();
        console.log(`Follow rate limited; queued candidates retained. Paused until ${state.cooldownUntil}`);
        await saveState(options.stateFile, state);
        break;
      }
      if (error instanceof AuthError || error.status === 401 || error.status === 403) {
        state.queue.unshift(...selected.slice(i));
        await saveState(options.stateFile, state);
        throw error;
      }
      state.failed[candidate.username.toLowerCase()] = {
        failedAt: new Date().toISOString(),
        error: error.message,
      };
      console.log(`Failed @${candidate.username}: ${error.message}`);
    }
    await saveState(options.stateFile, state);
    if (i < selected.length - 1) await sleep(options.delayMs);
  }

  await saveState(options.stateFile, state);
  return { discovered, selected: selected.length, followed };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const cookieHeader = await readCookieHeader(options.cookieFile);
  if (options.execute && (!/(?:^|;\s*)auth_token=/.test(cookieHeader) || !/(?:^|;\s*)ct0=/.test(cookieHeader))) {
    throw new Error(`--execute requires a cookie file with auth_token and ct0: ${options.cookieFile}`);
  }

  const client = new TwitterHttpClient({
    cookies: cookieHeader || undefined,
    guestToken: !cookieHeader,
  });
  const state = await loadState(options.stateFile);
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'DRY RUN'} | interval: ${options.intervalMinutes}m | per-cycle: ${options.perCycle} | daily cap: ${options.maxPerDay}`);

  do {
    await runCycle(client, state, options);
    if (options.once) break;
    console.log(`Next cycle in ${options.intervalMinutes} minutes.`);
    await sleep(options.intervalMinutes * 60_000);
  } while (true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Web3 follow task failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_QUERIES,
  parseArgs,
  loadState,
  saveState,
  signalScore,
  collectCandidateSignals,
  profileScore,
  isCandidate,
  discover,
  runCycle,
};
