import { deriveRequestHash, fetchSignedResponse, verifySignedResponse } from './airnode-v2.ts';
import { buildPriceRequest, DEFAULT_FEED_NAME, NODARY_AIRNODE_V2_ADDRESS, NODARY_AIRNODE_V2_URL } from './nodary.ts';

const feedName = process.argv[2] ?? DEFAULT_FEED_NAME;
const request = buildPriceRequest(feedName);
const signedResponse = await fetchSignedResponse(NODARY_AIRNODE_V2_URL, request);
await verifySignedResponse(signedResponse, NODARY_AIRNODE_V2_ADDRESS, deriveRequestHash(request));
console.log(JSON.stringify(signedResponse, null, 2));
