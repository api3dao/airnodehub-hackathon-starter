import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type Address, type Hex, verifyTypedData } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { fetchSignedResponse, type SignedResponse } from './airnode-v2.ts';
import { buildPriceRequest, NODARY_AIRNODE_V2_URL } from './nodary.ts';
import { BASE_SEPOLIA, createPayingFetch, PAYMENT_ASSET_ADDRESSES, type PaymentAsset } from './x402.ts';

const signedResponse = JSON.parse(
  readFileSync(new URL('../test/fixtures/nodary-eth-usd.json', import.meta.url), 'utf8')
) as SignedResponse;

const PAY_TO: Address = '0x1111111111111111111111111111111111111111';

// What an Airnode offers for a call priced at $0.001, in its order, with the EIP-712 domain of each token in `extra`.
const buildRequirements = (amount: string) => [
  {
    scheme: 'exact',
    network: BASE_SEPOLIA,
    amount,
    asset: PAYMENT_ASSET_ADDRESSES.aUSD,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: 'AirnodeHub USD', version: '1' },
  },
  {
    scheme: 'exact',
    network: BASE_SEPOLIA,
    amount,
    asset: PAYMENT_ASSET_ADDRESSES.USDC,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: 'USDC', version: '2' },
  },
];

interface PaymentPayload {
  accepted: { asset: string; amount: string; payTo: string; extra: { name: string; version: string } };
  payload: {
    signature: Hex;
    authorization: { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex };
  };
}

const toBase64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

// Answers as a priced Airnode does: 402 with the requirements, then the signed response once a payment comes with the
// call.
const createPricedAirnode = (amount: string) => {
  const payments: PaymentPayload[] = [];
  const fetchFromAirnode = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const paymentHeader = request.headers.get('PAYMENT-SIGNATURE');
    if (!paymentHeader) {
      const resource = { url: request.url, description: 'latestFeeds' };
      const paymentRequired = {
        x402Version: 2,
        error: 'Payment required',
        resource,
        accepts: buildRequirements(amount),
      };
      return Response.json(
        { error: 'Payment required' },
        { status: 402, headers: { 'PAYMENT-REQUIRED': toBase64(paymentRequired) } }
      );
    }
    payments.push(JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8')) as PaymentPayload);
    return Response.json(signedResponse);
  };
  return { fetchFromAirnode, payments };
};

const TRANSFER_WITH_AUTHORIZATION = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
] as const;

const assertPaysIn = async (asset: PaymentAsset, amount = '1000') => {
  const payerPrivateKey = generatePrivateKey();
  const payer = privateKeyToAccount(payerPrivateKey);
  const { fetchFromAirnode, payments } = createPricedAirnode(amount);

  const payingFetch = createPayingFetch(payerPrivateKey, asset, fetchFromAirnode);
  const response = await fetchSignedResponse(NODARY_AIRNODE_V2_URL, buildPriceRequest('ETH/USD'), payingFetch);

  assert.deepEqual(response, signedResponse);
  assert.equal(payments.length, 1);
  const [{ accepted, payload }] = payments as [PaymentPayload];
  const { authorization } = payload;
  assert.equal(accepted.asset, PAYMENT_ASSET_ADDRESSES[asset]);
  assert.deepEqual([authorization.from, authorization.to, authorization.value], [payer.address, PAY_TO, amount]);
  const isSignedByPayer = await verifyTypedData({
    address: payer.address,
    domain: { ...accepted.extra, chainId: 84_532, verifyingContract: accepted.asset as Address },
    types: { TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION },
    primaryType: 'TransferWithAuthorization',
    message: {
      ...authorization,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
    },
    signature: payload.signature,
  });
  assert.ok(isSignedByPayer);
};

test('pays for a priced call in USDC', () => assertPaysIn('USDC'));

// The Airnode offers aUSD first, so this also shows that the client pays in the asset that it was given.
test('pays for a priced call in aUSD', () => assertPaysIn('aUSD'));

test('pays one dollar for a call in USDC', () => assertPaysIn('USDC', '1000000'));

test('pays one dollar for a call in aUSD', () => assertPaysIn('aUSD', '1000000'));

const assertRefusesToPayIn = async (asset: PaymentAsset) => {
  const { fetchFromAirnode, payments } = createPricedAirnode('1000001');
  const payingFetch = createPayingFetch(generatePrivateKey(), asset, fetchFromAirnode);
  await assert.rejects(fetchSignedResponse(NODARY_AIRNODE_V2_URL, buildPriceRequest('ETH/USD'), payingFetch));
  assert.equal(payments.length, 0);
};

test('refuses to pay more than one dollar for a call in USDC', () => assertRefusesToPayIn('USDC'));

test('refuses to pay more than one dollar for a call in aUSD', () => assertRefusesToPayIn('aUSD'));
