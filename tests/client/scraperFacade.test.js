// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Regression tests for the Scraper facade over TwitterHttpClient.
 *
 * @author nich (@nichxbt)
 */

import { describe, it, expect, vi } from 'vitest';
import { Scraper } from '../../src/client/Scraper.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => body,
  };
}

const PROFILE_RESPONSE = {
  data: {
    user: {
      result: {
        __typename: 'User',
        rest_id: '42',
        core: { name: 'Example', screen_name: 'example' },
        profile_bio: { description: 'A test profile' },
        relationship_counts: { followers: 7, following: 3 },
        tweet_counts: { tweets: 11 },
      },
    },
  },
};

const SEARCH_RESPONSE = {
  data: {
    search_by_raw_query: {
      search_timeline: {
        timeline: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'tweet-1',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          rest_id: '1',
                          legacy: {
                            id_str: '1',
                            full_text: 'facade search result',
                            user_id_str: '42',
                          },
                          core: {
                            user_results: {
                              result: {
                                rest_id: '42',
                                core: { screen_name: 'example' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  },
};

describe('Scraper facade', () => {
  it('routes GraphQL GET profile reads through TwitterHttpClient', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(PROFILE_RESPONSE));
    const scraper = new Scraper({ fetch: fetchMock });

    const profile = await scraper.getProfile('example');

    expect(profile.username).toBe('example');
    expect(profile.followersCount).toBe(7);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain('/i/api/graphql/');
    expect(url).toContain('/UserByScreenName?');
    expect(request.method).toBe('GET');
  });

  it('routes GraphQL POST search reads through TwitterHttpClient', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(SEARCH_RESPONSE));
    const scraper = new Scraper({ fetch: fetchMock });

    const tweets = [];
    for await (const tweet of scraper.searchTweets('facade', 1)) {
      tweets.push(tweet);
    }

    expect(tweets).toHaveLength(1);
    expect(tweets[0].username).toBe('example');
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain('/SearchTimeline');
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body).variables.rawQuery).toBe('facade');
  });

  it('keeps cookie state on the facade and clears it on logout', async () => {
    const scraper = new Scraper({ cookies: 'auth_token=token; ct0=csrf' });

    expect(await scraper.isLoggedIn()).toBe(true);
    expect(await scraper.getCookies()).toEqual([
      { name: 'auth_token', value: 'token' },
      { name: 'ct0', value: 'csrf' },
    ]);

    await scraper.logout();

    expect(await scraper.isLoggedIn()).toBe(false);
    expect(await scraper.getCookies()).toEqual([]);
  });
});
