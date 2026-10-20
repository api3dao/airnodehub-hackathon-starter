import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { deriveRequestHash, type SignedResponse, verifySignedResponse } from './airnode-v2.ts';
import { buildPriceRequest, NODARY_AIRNODE_V2_ADDRESS } from './nodary.ts';

// Saved with `pnpm --silent fetch-response <feed name>`.
const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8')) as SignedResponse;

const ethUsdResponse = readFixture('nodary-eth-usd.json');
const ethUsdRequestHash = deriveRequestHash(buildPriceRequest('ETH/USD'));

test('derives the request hash that the Airnode signed', () => {
  assert.equal(ethUsdRequestHash, ethUsdResponse.requestHash);
});

test('derives the same request hash whatever the order of the projection fields', () => {
  const { responseProjection, ...request } = buildPriceRequest('ETH/USD');
  const reversedProjection = Object.fromEntries(Object.entries(responseProjection ?? {}).toReversed());
  assert.equal(deriveRequestHash({ ...request, responseProjection: reversedProjection }), ethUsdRequestHash);
  assert.equal(readFixture('nodary-eth-usd-reordered.json').requestHash, ethUsdRequestHash);
});

test('accepts a response that the Airnode signed', async () => {
  await verifySignedResponse(ethUsdResponse, NODARY_AIRNODE_V2_ADDRESS, ethUsdRequestHash);
});

test('rejects a response with an edited value', async () => {
  const editedResponse = { ...ethUsdResponse, data: ethUsdResponse.data.replace('"price":2', '"price":1') };
  await assert.rejects(verifySignedResponse(editedResponse, NODARY_AIRNODE_V2_ADDRESS, ethUsdRequestHash), /signed by/);
});

test('rejects a response to another request', async () => {
  const btcUsdResponse = readFixture('nodary-btc-usd.json');
  await assert.rejects(verifySignedResponse(btcUsdResponse, NODARY_AIRNODE_V2_ADDRESS, ethUsdRequestHash), /answers/);
  // A response that claims to answer the request still fails, because the signature covers the real request hash.
  const relabeledResponse = { ...btcUsdResponse, requestHash: ethUsdRequestHash };
  await assert.rejects(
    verifySignedResponse(relabeledResponse, NODARY_AIRNODE_V2_ADDRESS, ethUsdRequestHash),
    /signed by/
  );
});
