// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Regression: Tweet.fromGraphQL must parse both nested User shapes X serves.
 *
 * @author nich (@nichxbt)
 */

import { describe, it, expect } from 'vitest';
import { Tweet } from '../../../src/client/models/Tweet.js';

const BASE_TWEET = {
  __typename: 'Tweet',
  rest_id: '123',
  legacy: {
    id_str: '123',
    full_text: 'web3',
    created_at: 'Mon Jan 01 00:00:00 +0000 2024',
    user_id_str: '42',
  },
};

describe('Tweet.fromGraphQL author shapes', () => {
  it('reads the typed nested user shape', () => {
    const tweet = Tweet.fromGraphQL({
      ...BASE_TWEET,
      core: {
        user_results: {
          result: {
            rest_id: '42',
            core: { screen_name: 'typed_author' },
          },
        },
      },
    });

    expect(tweet.username).toBe('typed_author');
    expect(tweet.userId).toBe('42');
  });

  it('keeps parsing the legacy nested user shape', () => {
    const tweet = Tweet.fromGraphQL({
      ...BASE_TWEET,
      core: {
        user_results: {
          result: {
            rest_id: '42',
            legacy: { screen_name: 'legacy_author', id_str: '42' },
          },
        },
      },
    });

    expect(tweet.username).toBe('legacy_author');
    expect(tweet.userId).toBe('42');
  });
});
