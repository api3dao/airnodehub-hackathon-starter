import { deriveRequestHash } from './airnode-v2.ts';
import { buildPriceRequest, DEFAULT_FEED_NAME } from './nodary.ts';

const feedName = process.argv[2] ?? DEFAULT_FEED_NAME;
console.log(deriveRequestHash(buildPriceRequest(feedName)));
