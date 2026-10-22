import { ExactEvmScheme } from '@x402/evm';
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Base Sepolia, a testnet, where the Airnodes take payment, so a priced call costs nothing real.
export const BASE_SEPOLIA = 'eip155:84532';

// The Airnodes accept both. USDC comes from Circle's faucet, and AirnodeHub USD (aUSD) from the faucet that
// https://api3dao.github.io/airnodehub-hackathon/docs/from-api-to-contract#paying-with-x402 describes.
export const PAYMENT_ASSET_ADDRESSES = {
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  aUSD: '0xbeA34973e5f67F18F656A2C6070C64326C791808',
} as const;

export type PaymentAsset = keyof typeof PAYMENT_ASSET_ADDRESSES;

export const isPaymentAsset = (asset: string): asset is PaymentAsset => Object.hasOwn(PAYMENT_ASSET_ADDRESSES, asset);

// The most that one call can cost: one dollar, in either asset. Raise both to pay for pricier calls. aUSD has 6 decimals.
const MAX_USD_PER_PAYMENT = '$1';
const MAX_AUSD_PER_PAYMENT = '1000000';

// Wraps fetch so that it answers a 402 by signing the payment that the Airnode asks for, in `asset`, and sending the
// call again. The payer needs that asset on Base Sepolia, but no ETH, because the facilitator submits the transfer.
export const createPayingFetch = (
  payerPrivateKey: Hex,
  asset: PaymentAsset,
  fetchFunction: typeof fetch = fetch
): typeof fetch => {
  const assetAddress = PAYMENT_ASSET_ADDRESSES[asset].toLowerCase();
  return wrapFetchWithPaymentFromConfig(fetchFunction, {
    schemes: [{ network: BASE_SEPOLIA, client: new ExactEvmScheme(privateKeyToAccount(payerPrivateKey)) }],
    // The client pays only in the assets that it knows, such as USDC, unless it is told to accept another.
    spendControls: {
      maxAmountPerPayment: MAX_USD_PER_PAYMENT,
      allowedAssets: [
        { network: BASE_SEPOLIA, asset: PAYMENT_ASSET_ADDRESSES.aUSD, maxAmountPerPayment: MAX_AUSD_PER_PAYMENT },
      ],
    },
    // The Airnode offers every asset that it accepts, and the client would take the first one, so keep only the asset
    // that the payer holds.
    policies: [
      (_x402Version, requirements) =>
        requirements.filter((requirement) => requirement.asset.toLowerCase() === assetAddress),
    ],
  });
};
