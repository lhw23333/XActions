// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Pure-logic tests for the Web3 discovery/follow task.
 *
 * @author nich (@nichxbt)
 */

import { describe, expect, it } from 'vitest';
import {
  parseArgs,
  signalScore,
  profileScore,
  isCandidate,
  collectCandidateSignals,
} from '../../scripts/web3HotAccountFollow.js';

describe('web3 hot account follow task', () => {
  it('defaults to a 10-minute interval and caps follows at 100 per rolling day', () => {
    const defaults = parseArgs([]);
    const options = parseArgs(['--interval-minutes', '1', '--per-cycle', '9', '--max-per-day', '150']);

    expect(defaults.intervalMinutes).toBe(10);
    expect(defaults.maxPerDay).toBe(100);
    expect(options.intervalMinutes).toBe(5);
    expect(options.perCycle).toBe(3);
    expect(options.maxPerDay).toBe(100);
    expect(options.execute).toBe(false);
  });

  it('scores tweet signals using engagement metrics', () => {
    expect(signalScore({ metrics: { likes: 100, retweets: 20, replies: 5 } })).toBe(145);
  });

  it('collects recent typed author data and skips stale tweets', () => {
    const now = Date.now();
    const signals = new Map();
    collectCandidateSignals([
      {
        createdAt: new Date(now - 60_000).toISOString(),
        author: { username: 'web3_builder' },
        metrics: { likes: 10, retweets: 2, replies: 1 },
      },
      {
        createdAt: new Date(now - 8 * 24 * 60 * 60_000).toISOString(),
        author: { username: 'old_account' },
        metrics: { likes: 999, retweets: 999, replies: 999 },
      },
    ], 'web3 founder', signals, now);

    expect(signals.get('web3_builder')).toMatchObject({ username: 'web3_builder', signal: 15 });
    expect(signals.has('old_account')).toBe(false);
  });

  it('requires a relevant bio and the configured follower threshold', () => {
    const options = { minFollowers: 10_000 };
    expect(isCandidate({ username: 'builder', name: 'Protocol Founder', bio: 'Building DeFi', followers: 20_000 }, 10, options)).toBe(true);
    expect(isCandidate({ username: 'small', name: 'Protocol Founder', bio: 'Building DeFi', followers: 100 }, 10, options)).toBe(false);
    expect(profileScore({ name: 'Protocol Founder', bio: 'Building DeFi', followers: 20_000, verified: false }, 100)).toBeGreaterThan(0);
  });
});
