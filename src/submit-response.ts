import {
  createWalletClient,
  formatUnits,
  http,
  isAddress,
  isHex,
  parseAbi,
  parseEventLogs,
  publicActions,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deriveRequestHash, fetchSignedResponse, verifySignedResponse } from './airnode-v2.ts';
import { buildPriceRequest, DEFAULT_FEED_NAME, NODARY_AIRNODE_V2_ADDRESS, NODARY_AIRNODE_V2_URL } from './nodary.ts';

const consumerAbi = parseAbi([
  'function submitResponse(uint256 timestamp, bytes data, bytes signature)',
  'event PriceConsumed(uint256 price, uint256 priceTimestamp)',
  'error NotSignedByAirnode(address signer)',
  'error ResponseTooOld(uint256 responseTimestamp)',
  'error PriceTooOld(uint256 priceTimestamp)',
]);

const readEnvironmentVariable = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env or in the environment`);
  return value;
};

const consumerAddress = readEnvironmentVariable('CONSUMER_ADDRESS');
const privateKey = readEnvironmentVariable('PRIVATE_KEY');
if (!isAddress(consumerAddress)) throw new Error('CONSUMER_ADDRESS is not an address');
if (!isHex(privateKey)) throw new Error('PRIVATE_KEY is not a 0x-prefixed hex string');

// Must be the feed whose request hash the consumer was deployed with.
const feedName = process.argv[2] ?? DEFAULT_FEED_NAME;
const request = buildPriceRequest(feedName);
const signedResponse = await fetchSignedResponse(NODARY_AIRNODE_V2_URL, request);
await verifySignedResponse(signedResponse, NODARY_AIRNODE_V2_ADDRESS, deriveRequestHash(request));

const client = createWalletClient({
  account: privateKeyToAccount(privateKey),
  transport: http(readEnvironmentVariable('RPC_URL')),
}).extend(publicActions);

const transactionHash = await client.writeContract({
  address: consumerAddress,
  abi: consumerAbi,
  functionName: 'submitResponse',
  args: [BigInt(signedResponse.timestamp), toHex(signedResponse.data), signedResponse.signature],
  chain: null,
});
const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });

const [priceConsumed] = parseEventLogs({ abi: consumerAbi, eventName: 'PriceConsumed', logs: receipt.logs });
if (!priceConsumed) throw new Error(`Transaction ${transactionHash} emitted no PriceConsumed event`);
const { price, priceTimestamp } = priceConsumed.args;
const priceTakenAt = new Date(Number(priceTimestamp) * 1000).toISOString();
console.log(`Submitted ${signedResponse.data} in transaction ${transactionHash}`);
console.log(`The contract consumed the ${feedName} price ${formatUnits(price, 18)}, taken at ${priceTakenAt}`);
