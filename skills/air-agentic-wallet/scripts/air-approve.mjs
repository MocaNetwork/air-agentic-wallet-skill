#!/usr/bin/env node
import process from "node:process";

import {
  CHAIN_DEFAULTS,
  buildApproveCall,
  buildChainSummary,
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
  node air-approve.mjs --spender 0x... --amount 10 --asset USDC --chain-id 84532
  node air-approve.mjs --spender 0x... --amount 10 --asset USDC --chain-id 84532 --send --wait
  node air-approve.mjs --standard erc721 --token-address 0xCollection... --spender 0x... --token-id 1 --send --wait
  node air-approve.mjs --standard erc1155 --token-address 0xCollection... --spender 0x... --approve-all --send --wait

Required:
  --spender            Spender or operator address

Optional:
  --standard           erc20, erc404, erc721, erc1155
  --asset              Fungible asset preset, e.g. USDC, EURC, MOCA
  --token-address      Token or collection address
  --amount             Required for erc20 or erc404 approvals
  --decimals           Fungible decimals override
  --symbol             Fungible symbol override
  --token-id           Required for erc721 token-specific approve
  --approve-all        Use setApprovalForAll for erc721 or erc1155
  --approved           true or false; defaults to true
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
  --account-address    Override abstractAccountAddress
  --rpc-url            Override chain RPC URL
  --bundler-url        Override bundler URL
  --paymaster-url      Optional paymaster URL
  --chain-id           Override chain id

Notes:
  ERC404 support assumes ERC20-compatible approve behavior.
  If an ERC404 variant has custom approval methods, use air-execute.mjs instead.
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  if ((args["token-id"] != null || args["approve-all"]) && !args.standard) {
    throw new Error(
      "Provide --standard erc721 or --standard erc1155 for NFT approval flows.",
    );
  }

  const context = await loadAirContext(args);
  const keys = await loadAgentKeys(args);
  const assetPreset = resolveAssetPreset({ chainId: context.chainId, asset: args.asset });
  const standard =
    args.standard ??
    (assetPreset?.type === "erc20" ? "erc20" : args["token-id"] != null ? undefined : "erc20");
  const send = Boolean(args.send);
  const wait = Boolean(args.wait);
  const gasOverrides = {
    callGasLimit: args["call-gas-limit"],
    verificationGasLimit: args["verification-gas-limit"],
    preVerificationGas: args["pre-verification-gas"],
    maxFeePerGas: args["max-fee-per-gas"],
    maxPriorityFeePerGas: args["max-priority-fee-per-gas"],
  };

  const approval = await buildApproveCall({
    context,
    standard,
    tokenAddress:
      args["token-address"] ??
      (assetPreset?.type === "erc20" ? assetPreset.address : undefined),
    spender: args.spender,
    amount: args.amount,
    decimals: args.decimals ?? assetPreset?.decimals,
    tokenId: args["token-id"],
    approveAll: args["approve-all"],
    approved: args.approved,
    symbol: args.symbol ?? assetPreset?.symbol ?? args.asset,
  });
  const prepared = await prepareAndSignUserOperation({
    context,
    keys,
    callData: approval.callData,
    gasOverrides,
  });

  const summary = {
    ...buildChainSummary(context),
    chainName: CHAIN_DEFAULTS[context.chainId]?.name ?? null,
    from: context.abstractAccountAddress,
    validatorAddress: prepared.validatorAddress,
    userOpHash: prepared.userOpHash,
    userOperation: prepared.userOperation,
    ...approval.summary,
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
