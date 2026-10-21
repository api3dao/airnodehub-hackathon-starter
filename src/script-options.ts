import { parseArgs } from 'node:util';
import { isHex } from 'viem';
import type { AirnodeV2Route } from './airnode-v2.ts';
import { DEFAULT_FEED_NAME } from './nodary.ts';
import { createPayingFetch, isPaymentAsset } from './x402.ts';

// Every script takes `[feed name] [--passthrough]`, and calls POST / unless it is given --passthrough.
export const parseScriptArguments = () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { passthrough: { type: 'boolean', default: false } },
  });
  const route: AirnodeV2Route = values.passthrough ? 'passthrough' : 'post';
  return { feedName: positionals[0] ?? DEFAULT_FEED_NAME, route };
};

// The scripts pay for a priced operation when PAYER_PRIVATE_KEY is set, in PAYMENT_ASSET, which is USDC unless set to
// aUSD. Without a payer, a priced operation fails with 402.
export const createScriptFetch = (): typeof fetch => {
  const payerPrivateKey = process.env.PAYER_PRIVATE_KEY;
  if (!payerPrivateKey) return fetch;
  if (!isHex(payerPrivateKey)) throw new Error('PAYER_PRIVATE_KEY is not a 0x-prefixed hex string');

  const asset = process.env.PAYMENT_ASSET ?? 'USDC';
  if (!isPaymentAsset(asset)) throw new Error(`PAYMENT_ASSET is ${asset}, but the Airnodes accept only USDC and aUSD`);
  return createPayingFetch(payerPrivateKey, asset);
};
