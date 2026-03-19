#!/usr/bin/env node
import process from "node:process";

import {
  CHAIN_DEFAULTS,
  buildChainSummary,
  buildNftTransferCall,
  loadAgentKeys,
  loadAirContext,
  parseArgs,
  prepareAndSignUserOperation,
  printJson,
  submitUserOperation,
} from "./air-common.mjs";

function printHelp() {
  console.log(`Usage:
  node air-nft-transfer.mjs --standard erc721 --token-address 0xCollection... --recipient 0x... --token-id 1
  node air-nft-transfer.mjs --standard erc721 --token-address 0xCollection... --recipient 0x... --token-id 1 --send --wait
  node air-nft-transfer.mjs --standard erc1155 --token-address 0xCollection... --recipient 0x... --token-id 1 --amount 2 --send --wait

Required:
  --standard           erc721 or erc1155
  --token-address      NFT collection address
  --recipient          Recipient address
  --token-id           Token id to transfer

Optional:
  --amount             Required for erc1155 transfers
  --data               Bytes payload for erc1155 safeTransferFrom, defaults to 0x
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
  For ERC404 collections, use air-execute.mjs unless the contract exactly matches ERC721 or ERC1155 transfer semantics.
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.standard) {
    throw new Error("Provide --standard erc721 or --standard erc1155.");
  }

  const context = await loadAirContext(args);
  const keys = await loadAgentKeys(args);
  const send = Boolean(args.send);
  const wait = Boolean(args.wait);
  const gasOverrides = {
    callGasLimit: args["call-gas-limit"],
    verificationGasLimit: args["verification-gas-limit"],
    preVerificationGas: args["pre-verification-gas"],
    maxFeePerGas: args["max-fee-per-gas"],
    maxPriorityFeePerGas: args["max-priority-fee-per-gas"],
  };

  const transfer = await buildNftTransferCall({
    context,
    standard: args.standard,
    tokenAddress: args["token-address"],
    recipient: args.recipient,
    tokenId: args["token-id"],
    amount: args.amount,
    data: args.data ?? "0x",
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
    validatorAddress: prepared.validatorAddress,
    userOpHash: prepared.userOpHash,
    userOperation: prepared.userOperation,
    ...transfer.summary,
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
