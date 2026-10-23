import { parseArgs } from 'node:util';
import { isHex } from 'viem';
import type { AirnodeV2Route } from './airnode-v2.ts';
import { DEFAULT_FEED_NAME } from './nodary.ts';
import { createPayingFetch, isPaymentAsset, readPaymentSettlement } from './x402.ts';

// Every script takes `[feed name] [--passthrough]`, and calls POST / unless it is given --passthrough.
export const parseScriptArguments = () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { passthrough: { type: 'boolean', default: false } },
  });
  const route: AirnodeV2Route = values.passthrough ? 'passthrough' : 'post';
  return { feedName: positionals[0] ?? DEFAULT_FEED_NAME, route };
};

// The Airnode answers an unpaid call to a priced operation with only {"error":"Payment required"}.
const fetchWithoutPayer: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status !== 402) return response;
  throw new Error(
    'The operation is priced and answered 402. Set PAYER_PRIVATE_KEY in .env to an account that holds testnet USDC or aUSD on Base Sepolia, and the scripts pay for it'
  );
};

// Prints to stderr, so that `pnpm --silent fetch-response > response.json` saves only the response.
const wrapFetchWithSettlementPrinting =
  (payingFetch: typeof fetch): typeof fetch =>
  async (input, init) => {
    const response = await payingFetch(input, init);
    const settlement = readPaymentSettlement(response);
    if (!settlement) return response;
    console.error(
      settlement.success
        ? `The payment settled in transaction https://sepolia.basescan.org/tx/${settlement.transaction}`
        : `The payment did not settle: ${settlement.errorReason}`
    );
    return response;
  };

// The scripts pay for a priced operation when PAYER_PRIVATE_KEY is set, in PAYMENT_ASSET, which is USDC unless set to
// aUSD.
export const createScriptFetch = (): typeof fetch => {
  const payerPrivateKey = process.env.PAYER_PRIVATE_KEY;
  if (!payerPrivateKey) return fetchWithoutPayer;
  if (!isHex(payerPrivateKey)) throw new Error('PAYER_PRIVATE_KEY is not a 0x-prefixed hex string');

  const asset = process.env.PAYMENT_ASSET ?? 'USDC';
  if (!isPaymentAsset(asset)) throw new Error(`PAYMENT_ASSET is ${asset}, but the Airnodes accept only USDC and aUSD`);
  return wrapFetchWithSettlementPrinting(createPayingFetch(payerPrivateKey, asset));
};
