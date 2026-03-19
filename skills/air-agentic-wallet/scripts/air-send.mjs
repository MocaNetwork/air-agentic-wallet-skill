#!/usr/bin/env node
import process from "node:process";

import {
  CHAIN_DEFAULTS,
  assertRequired,
  buildChainSummary,
  buildTransferCall,
  loadAgentKeys,
  loadAirContext,
  parseArgs,
  prepareAndSignUserOperation,
  printJson,
  resolveAssetPreset,
  submitUserOperation,
} from "./air-common.mjs";

function printHelp() {
  console.log(`Usage:
  node air-send.mjs --recipient 0x... --amount 0.001
  node air-send.mjs --recipient 0x... --amount 10 --asset USDC --chain-id 84532
  node air-send.mjs --recipient 0x... --amount 10 --asset USDC --chain-id 84532 --send --wait

Required:
  --recipient          Recipient address
  --amount             Human-readable amount

Optional:
  --asset              Asset symbol preset, e.g. USDC, EURC, MOCA, ETH
  --token-address      ERC-20 token address; omit for native token
  --symbol             Symbol override for display only
  --decimals           Token decimals override
  --call-gas-limit     Override callGasLimit (decimal or 0x hex)
  --verification-gas-limit Override verificationGasLimit (decimal or 0x hex)
  --pre-verification-gas Override preVerificationGas (decimal or 0x hex)
  --max-fee-per-gas    Override maxFeePerGas (decimal or 0x hex)
  --max-priority-fee-per-gas Override maxPriorityFeePerGas (decimal or 0x hex)
  --send               Actually submit the UserOp
  --wait               Poll for receipt after submission
  --config             Path to .air-wallet-config.json
  --private-key        Path to agent P-256 private key PEM
  --public-key         Path to agent public key PEM
  --user-id            Override AIR userId
  --wallet-id          Override AIR walletId
  --account-address    Override abstractAccountAddress
  --agent-sign-url     Override full AIR /v2/wallet/agent-sign URL
  --rpc-url            Override chain RPC URL
  --bundler-url        Override bundler URL
  --paymaster-url      Optional paymaster URL
  --chain-id           Override chain id

Behavior:
  Without --send, this prepares the UserOp and prints JSON only.
  With --send, it submits the UserOp.
  With --send --wait, it also polls for a receipt.

Common presets:
  84532 Base Sepolia: USDC, EURC, ETH
  8453  Base: USDC, MOCA, ETH
  1     Ethereum: USDC, MOCA, ETH

Config fallback order:
  CLI flags -> environment variables -> .air-wallet-config.json
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const context = await loadAirContext(args);
  const keys = await loadAgentKeys(args);

  assertRequired(
    context.abstractAccountAddress,
    "abstractAccountAddress is required for onchain send.",
  );
  assertRequired(context.rpcUrl, "rpcUrl is required for onchain send.");
  assertRequired(context.bundlerUrl, "bundlerUrl is required for onchain send.");

  const recipient = assertRequired(args.recipient, "Provide --recipient.");
  const amount = assertRequired(args.amount, "Provide --amount.");
  const asset = args.asset;
  const assetPreset = resolveAssetPreset({ chainId: context.chainId, asset });
  const tokenAddress =
    args["token-address"] ??
    (assetPreset?.type === "erc20" ? assetPreset.address : undefined);
  const symbol = args.symbol ?? assetPreset?.symbol ?? asset;
  const decimals = args.decimals ?? assetPreset?.decimals;
  const send = Boolean(args.send);
  const wait = Boolean(args.wait);
  const gasOverrides = {
    callGasLimit: args["call-gas-limit"],
    verificationGasLimit: args["verification-gas-limit"],
    preVerificationGas: args["pre-verification-gas"],
    maxFeePerGas: args["max-fee-per-gas"],
    maxPriorityFeePerGas: args["max-priority-fee-per-gas"],
  };

  const transfer = await buildTransferCall({
    context,
    recipient,
    amount,
    tokenAddress,
    symbol,
    decimals,
  });

  const prepared = await prepareAndSignUserOperation({
    context,
    keys,
    callData: transfer.callData,
    gasOverrides,
  });

  const summary = {
    ...buildChainSummary(context),
    chainName: CHAIN_DEFAULTS[context.chainId]?.name ?? null,
    from: context.abstractAccountAddress,
    recipient,
    transfer: transfer.summary,
    validatorAddress: prepared.validatorAddress,
    userOpHash: prepared.userOpHash,
    userOperation: prepared.userOperation,
  };

  if (!send) {
    printJson({ mode: "prepare", ...summary });
    return;
  }

  const result = await submitUserOperation({
    context,
    userOperation: prepared.userOperation,
    wait,
  });

  printJson({
    mode: wait ? "send-and-wait" : "send",
    ...summary,
    submittedUserOpHash: result.userOpHash,
    receipt: result.receipt ?? null,
  });
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
