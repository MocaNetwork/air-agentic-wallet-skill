#!/usr/bin/env node
import process from "node:process";

import {
  assertRequired,
  buildChainSummary,
  buildExecuteCallData,
  loadAgentKeys,
  loadAirContext,
  parseArgs,
  prepareAndSignUserOperation,
  printJson,
  submitUserOperation,
} from "./air-common.mjs";

function printHelp() {
  console.log(`Usage:
  node air-execute.mjs --target 0x... --data 0xabcdef --value 0
  node air-execute.mjs --target 0x... --data 0xabcdef --value 0 --send --wait

Required:
  --target             Contract or recipient address to call
  --data               Hex calldata for the target call

Optional:
  --value              Native token value in wei, defaults to 0
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
    "abstractAccountAddress is required for onchain execute.",
  );
  assertRequired(context.rpcUrl, "rpcUrl is required for onchain execute.");
  assertRequired(context.bundlerUrl, "bundlerUrl is required for onchain execute.");

  const target = assertRequired(args.target, "Provide --target.");
  const value = BigInt(args.value ?? "0");
  const data = assertRequired(args.data, "Provide --data hex calldata.");
  const send = Boolean(args.send);
  const wait = Boolean(args.wait);
  const gasOverrides = {
    callGasLimit: args["call-gas-limit"],
    verificationGasLimit: args["verification-gas-limit"],
    preVerificationGas: args["pre-verification-gas"],
    maxFeePerGas: args["max-fee-per-gas"],
    maxPriorityFeePerGas: args["max-priority-fee-per-gas"],
  };

  const prepared = await prepareAndSignUserOperation({
    context,
    keys,
    callData: buildExecuteCallData({ target, value, data }),
    gasOverrides,
  });

  const summary = {
    ...buildChainSummary(context),
    from: context.abstractAccountAddress,
    target,
    value: value.toString(),
    data,
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
