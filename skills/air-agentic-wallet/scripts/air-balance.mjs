#!/usr/bin/env node
import process from "node:process";

import {
  CHAIN_DEFAULTS,
  buildChainSummary,
  getAssetBalance,
  loadAirContext,
  parseArgs,
  printJson,
  resolveAssetPreset,
} from "./air-common.mjs";

function printHelp() {
  console.log(`Usage:
  node air-balance.mjs
  node air-balance.mjs --asset USDC --chain-id 84532
  node air-balance.mjs --standard erc721 --token-address 0xCollection...
  node air-balance.mjs --standard erc1155 --token-address 0xCollection... --token-id 1

Optional:
  --owner              Address to inspect, defaults to abstractAccountAddress
  --standard           native, erc20, erc404, erc721, erc1155
  --asset              Fungible asset preset, e.g. USDC, EURC, MOCA, ETH
  --token-address      Contract address for token or NFT collection
  --token-id           Required for erc1155; optional extra owner check for erc721
  --symbol             Symbol override for native or fungible display
  --decimals           Decimals override for erc20 or erc404
  --config             Path to .air-wallet-config.json
  --account-address    Override abstractAccountAddress
  --rpc-url            Override chain RPC URL
  --chain-id           Override chain id

Notes:
  ERC404 support assumes ERC20-compatible balanceOf/decimals/symbol behavior.
  If an ERC404 implementation is custom, fall back to air-execute.mjs or manual eth_call.
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  if (args["token-id"] != null && !args.standard) {
    throw new Error("Provide --standard erc721 or --standard erc1155 when using --token-id.");
  }

  const context = await loadAirContext(args);
  const assetPreset = resolveAssetPreset({ chainId: context.chainId, asset: args.asset });
  const tokenAddress =
    args["token-address"] ??
    (assetPreset?.type === "erc20" ? assetPreset.address : undefined);
  const standard =
    args.standard ??
    (assetPreset?.type === "native"
      ? "native"
      : assetPreset?.type === "erc20"
        ? "erc20"
        : args["token-id"] != null
          ? undefined
          : tokenAddress
            ? "erc20"
            : "native");
  const balance = await getAssetBalance({
    context,
    owner: args.owner,
    standard,
    tokenAddress,
    tokenId: args["token-id"],
    symbol: args.symbol ?? assetPreset?.symbol ?? args.asset,
    decimals: args.decimals ?? assetPreset?.decimals,
  });

  printJson({
    ...buildChainSummary(context),
    chainName: CHAIN_DEFAULTS[context.chainId]?.name ?? null,
    ...balance,
  });
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
