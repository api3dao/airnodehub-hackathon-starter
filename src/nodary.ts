import type { Address } from 'viem';
import type { AirnodeV2Request } from './airnode-v2.ts';

export const NODARY_AIRNODE_V2_URL = 'https://airnode-nodary.fly.dev/';

// The address that the Nodary Airnode v2 signs with, from the x-airnode extension of the document at its URL.
export const NODARY_AIRNODE_V2_ADDRESS: Address = '0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0';

export const DEFAULT_FEED_NAME = 'ETH/USD';

// A JSON Pointer writes "~" in a name as "~0" and "/" as "~1", so ETH/USD becomes ETH~1USD.
const escapePointerToken = (token: string) => token.replaceAll('~', '~0').replaceAll('/', '~1');

// Nodary answers with {"ETH/USD":{"value":2443.95,"timestamp":1792403240691,"category":"crypto"}}, and the projection
// cuts that down to {"price":2443.95,"updatedAt":1792403240691}.
export const buildPriceRequest = (feedName: string): AirnodeV2Request => ({
  operation: 'latestFeeds',
  parameters: { name: feedName },
  responseProjection: {
    price: `/${escapePointerToken(feedName)}/value`,
    updatedAt: `/${escapePointerToken(feedName)}/timestamp`,
  },
});
