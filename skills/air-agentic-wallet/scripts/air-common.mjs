import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import process from 'node:process';

import {
  decodeFunctionResult,
  encodeFunctionData,
  encodePacked,
  formatUnits,
  getAddress,
  isAddress,
  parseAbi,
  parseUnits,
} from 'viem';
import {
  entryPoint07Address,
  getUserOperationHash,
} from 'viem/account-abstraction';

export const AIR_ENTRYPOINT_VERSION = '0.7';
export const AIR_ENTRYPOINT_ADDRESS = entryPoint07Address;
export const LEGACY_BICONOMY_K1_VALIDATOR =
  '0x0000002D6DB27c52E3C11c1Cf24072004AC75cBa';

const NEXUS_VALIDATOR_ADDRESS = '0x0000002D6DB27c52E3C11c1Cf24072004AC75cBa';

export const CHAIN_DEFAULTS = {
  84532: {
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    bundlerUrl: 'https://api.candide.dev/public/v3/base-sepolia',
    assets: {
      USDC: {
        type: 'erc20',
        address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        decimals: 6,
      },
      EURC: {
        type: 'erc20',
        address: '0x808456652fdb597867f38412077A9182bf77359F',
        decimals: 6,
      },
      ETH: { type: 'native', symbol: 'ETH', decimals: 18 },
      NATIVE: { type: 'native', symbol: 'ETH', decimals: 18 },
    },
  },
  8453: {
    name: 'Base',
    assets: {
      USDC: {
        type: 'erc20',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
      },
      MOCA: {
        type: 'erc20',
        address: '0x2b11834ed1feaed4b4b3a86a6f571315e25a884d',
        decimals: 18,
      },
      ETH: { type: 'native', symbol: 'ETH', decimals: 18 },
      NATIVE: { type: 'native', symbol: 'ETH', decimals: 18 },
    },
  },
  1: {
    name: 'Ethereum',
    assets: {
      USDC: {
        type: 'erc20',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      },
      MOCA: {
        type: 'erc20',
        address: '0xf944e35f95e819e752f3ccb5faf40957d311e8c5',
        decimals: 18,
      },
      ETH: { type: 'native', symbol: 'ETH', decimals: 18 },
      NATIVE: { type: 'native', symbol: 'ETH', decimals: 18 },
    },
  },
};

const DEFAULT_CONFIG_PATH = '.air-wallet-config.json';
const DEFAULT_PRIVATE_KEY_PATH = 'p256-private-key.pem';
const DEFAULT_PUBLIC_KEY_PATH = 'p256-public-key.pem';

const executeAbi = parseAbi([
  'function execute(bytes32 mode, bytes calldata executionCalldata) external',
]);
const executeSingleMode = `0x${'00'.repeat(32)}`;
const isModuleInstalledAbi = parseAbi([
  'function isModuleInstalled(uint256 moduleTypeId, address module, bytes additionalContext) view returns (bool)',
]);
const getNonceAbi = parseAbi([
  'function getNonce(address sender, uint192 key) view returns (uint256)',
]);
const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);
const erc721Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
]);
const erc1155Abi = parseAbi([
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function readJsonIfExists(path) {
  try {
    const content = await fs.readFile(path, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function loadAirContext(args = {}) {
  const fileConfig = await readJsonIfExists(args.config ?? DEFAULT_CONFIG_PATH);
  const merged = {
    ...fileConfig,
    userId: args['user-id'] ?? process.env.AIR_USER_ID ?? fileConfig.userId,
    walletId:
      args['wallet-id'] ?? process.env.AIR_WALLET_ID ?? fileConfig.walletId,
    privyAppId:
      args['privy-app-id'] ??
      process.env.AIR_PRIVY_APP_ID ??
      process.env.PRIVY_APP_ID ??
      fileConfig.privyAppId,
    abstractAccountAddress:
      args['account-address'] ??
      process.env.AIR_ACCOUNT_ADDRESS ??
      fileConfig.abstractAccountAddress,
    airApiAgentSignUrl:
      args['agent-sign-url'] ??
      process.env.AIR_API_AGENT_SIGN_URL ??
      fileConfig.airApiAgentSignUrl,
    rpcUrl: args['rpc-url'] ?? process.env.AIR_RPC_URL ?? fileConfig.rpcUrl,
    bundlerUrl:
      args['bundler-url'] ??
      process.env.AIR_BUNDLER_URL ??
      fileConfig.bundlerUrl,
    paymasterUrl:
      args['paymaster-url'] ??
      process.env.AIR_PAYMASTER_URL ??
      fileConfig.paymasterUrl,
    chainId:
      Number(
        args['chain-id'] ??
          process.env.AIR_CHAIN_ID ??
          fileConfig.chainId ??
          84532,
      ) || 84532,
    privateKeyPath:
      args['private-key'] ??
      process.env.AIR_PRIVATE_KEY_PATH ??
      fileConfig.privateKeyPath,
    publicKeyPath:
      args['public-key'] ??
      process.env.AIR_PUBLIC_KEY_PATH ??
      fileConfig.publicKeyPath,
  };

  if (
    !merged.userId ||
    !merged.walletId ||
    !merged.privyAppId ||
    !merged.airApiAgentSignUrl
  ) {
    throw new Error(
      'Missing AIR context. Provide userId, walletId, privyAppId, and airApiAgentSignUrl via .air-wallet-config.json, env, or CLI flags.',
    );
  }

  if (merged.abstractAccountAddress) {
    merged.abstractAccountAddress = getAddress(merged.abstractAccountAddress);
  }

  const chainDefaults = CHAIN_DEFAULTS[merged.chainId];
  if (!merged.rpcUrl && chainDefaults?.rpcUrl)
    merged.rpcUrl = chainDefaults.rpcUrl;
  if (!merged.bundlerUrl && chainDefaults?.bundlerUrl) {
    merged.bundlerUrl = chainDefaults.bundlerUrl;
  }

  return merged;
}

export async function loadAgentKeys(args = {}) {
  const fileConfig = await readJsonIfExists(args.config ?? DEFAULT_CONFIG_PATH);
  const privateKeyPath =
    args['private-key'] ??
    process.env.AIR_PRIVATE_KEY_PATH ??
    fileConfig.privateKeyPath ??
    DEFAULT_PRIVATE_KEY_PATH;
  const publicKeyPath =
    args['public-key'] ??
    process.env.AIR_PUBLIC_KEY_PATH ??
    fileConfig.publicKeyPath ??
    DEFAULT_PUBLIC_KEY_PATH;
  const privateKeyPem = await fs.readFile(privateKeyPath, 'utf8');

  let publicKeyPem;
  try {
    publicKeyPem = (await fs.readFile(publicKeyPath, 'utf8')).trim();
  } catch {
    const privateKey = crypto.createPrivateKey({
      key: privateKeyPem,
      format: 'pem',
    });
    publicKeyPem = crypto
      .createPublicKey(privateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString()
      .trim();
  }

  return { privateKeyPem, publicKeyPem };
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}}`;
}

export function signP256Base64({ message, privateKeyPem }) {
  const signer = crypto.createSign('SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem).toString('base64');
}

export function buildSignedMessage({ userId, publicKeyPem, privateKeyPem }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${publicKeyPem}:${userId}:${timestamp}`;
  return {
    message,
    signature: signP256Base64({ message, privateKeyPem }),
    publicKey: publicKeyPem,
  };
}

export function resolveAssetPreset({ chainId, asset }) {
  if (!asset) return null;
  return CHAIN_DEFAULTS[chainId]?.assets?.[String(asset).toUpperCase()] ?? null;
}

export function normalizeTokenStandard(standard, fallback = 'erc20') {
  return String(standard ?? fallback).toLowerCase();
}

export function parseBooleanish(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

export function normalizePersonalSignPayload(input) {
  if (typeof input !== 'string') {
    throw new Error('personal_sign payload must be a string');
  }
  if (input.startsWith('0x')) return input;
  return `0x${Buffer.from(input, 'utf8').toString('hex')}`;
}

export function buildPrivyRpcBody({ walletId, method, payload }) {
  const rpcUrl = `https://api.privy.io/v1/wallets/${walletId}/rpc`;

  if (method === 'personal_sign') {
    const normalized = normalizePersonalSignPayload(payload);
    return {
      rpcUrl,
      rpcBody: {
        method,
        params: {
          message: normalized.slice(2),
          encoding: 'hex',
        },
      },
      payloadForAir: normalized,
    };
  }

  if (method === 'eth_signTypedData_v4') {
    const typedData = payload;
    return {
      rpcUrl,
      rpcBody: {
        method,
        params: {
          typed_data: {
            primary_type: typedData.primaryType ?? typedData.primary_type,
            domain: typedData.domain,
            types: typedData.types,
            message: typedData.message,
          },
        },
      },
      payloadForAir: payload,
    };
  }

  throw new Error(`Unsupported signing method: ${method}`);
}

export function buildAgentSignRequest({ context, keys, method, payload }) {
  const signedMessage = buildSignedMessage({
    userId: context.userId,
    publicKeyPem: keys.publicKeyPem,
    privateKeyPem: keys.privateKeyPem,
  });
  const { rpcUrl, rpcBody, payloadForAir } = buildPrivyRpcBody({
    walletId: context.walletId,
    method,
    payload,
  });
  const canonicalPayload = {
    version: 1,
    method: 'POST',
    url: rpcUrl,
    body: rpcBody,
    headers: {
      'privy-app-id': context.privyAppId,
    },
  };

  return {
    signedMessage,
    method,
    payload: payloadForAir,
    agentSignature: signP256Base64({
      message: Buffer.from(canonicalize(canonicalPayload)),
      privateKeyPem: keys.privateKeyPem,
    }),
  };
}

export async function postJson(url, body) {
  const originalTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (url.startsWith('https://localhost')) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!response.ok) {
      throw new Error(`${response.status} ${JSON.stringify(data)}`);
    }
    return data;
  } finally {
    if (url.startsWith('https://localhost')) {
      if (originalTlsSetting === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsSetting;
      }
    }
  }
}

export async function signWithAir({ context, keys, method, payload }) {
  const request = buildAgentSignRequest({ context, keys, method, payload });
  const data = await postJson(context.airApiAgentSignUrl, request);
  if (!data?.signature) {
    throw new Error(`AIR response missing signature: ${JSON.stringify(data)}`);
  }
  return { request, signature: data.signature };
}

/**
 * Wrap a raw EOA signature for Nexus smart account verification.
 * Prepends the K1 validator address to produce a valid Nexus signature.
 */
export function wrapNexusSignature(eoaSignature) {
  return `0x${NEXUS_VALIDATOR_ADDRESS.slice(2)}${eoaSignature.slice(2)}`;
}

export async function jsonRpcCall(rpcUrl, method, params) {
  const result = await postJson(rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });
  if (result?.error) {
    throw new Error(`RPC ${method}: ${JSON.stringify(result.error)}`);
  }
  if (!('result' in result)) {
    throw new Error(
      `RPC ${method}: malformed response ${JSON.stringify(result)}`,
    );
  }
  return result.result;
}

export async function readContract({
  context,
  address,
  abi,
  functionName,
  args = [],
}) {
  const data = await jsonRpcCall(context.rpcUrl, 'eth_call', [
    {
      to: getAddress(address),
      data: encodeFunctionData({
        abi,
        functionName,
        args,
      }),
    },
    'latest',
  ]);
  return decodeFunctionResult({
    abi,
    functionName,
    data,
  });
}

export function buildExecuteCallData({ target, value, data = '0x' }) {
  return encodeFunctionData({
    abi: executeAbi,
    functionName: 'execute',
    args: [
      executeSingleMode,
      encodePacked(
        ['address', 'uint256', 'bytes'],
        [getAddress(target), value, data],
      ),
    ],
  });
}

async function resolveFungibleTokenMetadata({
  context,
  tokenAddress,
  symbol,
  decimals,
  standard = 'erc20',
}) {
  if (!isAddress(tokenAddress))
    throw new Error('token-address must be a valid address');
  const token = getAddress(tokenAddress);
  const normalizedStandard = normalizeTokenStandard(standard);
  const abi = normalizedStandard === 'erc404' ? erc20Abi : erc20Abi;
  const tokenSymbol =
    symbol ??
    (await readContract({
      context,
      address: token,
      abi,
      functionName: 'symbol',
    }).catch(() => normalizedStandard.toUpperCase()));
  const tokenDecimals =
    decimals != null
      ? Number(decimals)
      : Number(
          await readContract({
            context,
            address: token,
            abi,
            functionName: 'decimals',
          }).catch(() => 18),
        );
  return {
    token,
    symbol: tokenSymbol,
    decimals: tokenDecimals,
  };
}

export async function getLegacyValidatorAddress({ context }) {
  const installed = await jsonRpcCall(context.rpcUrl, 'eth_call', [
    {
      to: context.abstractAccountAddress,
      data: encodeFunctionData({
        abi: isModuleInstalledAbi,
        functionName: 'isModuleInstalled',
        args: [1n, LEGACY_BICONOMY_K1_VALIDATOR, '0x'],
      }),
    },
    'latest',
  ]);
  if (BigInt(installed) !== 1n) {
    throw new Error(
      'Legacy Biconomy K1 Validator is not installed on this smart account',
    );
  }
  return LEGACY_BICONOMY_K1_VALIDATOR;
}

export async function getAccountNonce({ context, validatorAddress }) {
  const nonceHex = await jsonRpcCall(context.rpcUrl, 'eth_call', [
    {
      to: AIR_ENTRYPOINT_ADDRESS,
      data: encodeFunctionData({
        abi: getNonceAbi,
        functionName: 'getNonce',
        args: [context.abstractAccountAddress, BigInt(validatorAddress)],
      }),
    },
    'latest',
  ]);
  return BigInt(nonceHex);
}

function normalizeV07UserOperation(userOp) {
  return {
    sender: userOp.sender,
    nonce: toHexQuantity(userOp.nonce),
    factory: null,
    factoryData: null,
    callData: userOp.callData,
    callGasLimit: toHexQuantity(userOp.callGasLimit),
    verificationGasLimit: toHexQuantity(userOp.verificationGasLimit),
    preVerificationGas: toHexQuantity(userOp.preVerificationGas),
    maxFeePerGas: toHexQuantity(userOp.maxFeePerGas),
    maxPriorityFeePerGas: toHexQuantity(userOp.maxPriorityFeePerGas),
    paymaster: userOp.paymaster ?? null,
    paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit
      ? toHexQuantity(userOp.paymasterVerificationGasLimit)
      : null,
    paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit
      ? toHexQuantity(userOp.paymasterPostOpGasLimit)
      : null,
    paymasterData: userOp.paymasterData ?? null,
    signature: userOp.signature,
  };
}

function withGasFloor(userOp) {
  return {
    ...userOp,
    callGasLimit: userOp.callGasLimit || 300000n,
    verificationGasLimit: userOp.verificationGasLimit || 1500000n,
    preVerificationGas: userOp.preVerificationGas || 4000000n,
  };
}

function withGasBuffer(estimate, percentBuffer, floor) {
  const buffered = (estimate * BigInt(100 + percentBuffer)) / 100n;
  return buffered > floor ? buffered : floor;
}

function applyEstimate(userOp, estimate) {
  return {
    ...userOp,
    callGasLimit: estimate.callGasLimit
      ? withGasBuffer(BigInt(estimate.callGasLimit), 20, 300000n)
      : userOp.callGasLimit,
    verificationGasLimit: estimate.verificationGasLimit
      ? withGasBuffer(BigInt(estimate.verificationGasLimit), 100, 1500000n)
      : userOp.verificationGasLimit,
    preVerificationGas: estimate.preVerificationGas
      ? withGasBuffer(BigInt(estimate.preVerificationGas), 50, 4000000n)
      : userOp.preVerificationGas,
  };
}

function parseOptionalBigInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return BigInt(value);
}

function applyGasOverrides(userOp, gasOverrides = {}) {
  return {
    ...userOp,
    callGasLimit:
      parseOptionalBigInt(gasOverrides.callGasLimit) ?? userOp.callGasLimit,
    verificationGasLimit:
      parseOptionalBigInt(gasOverrides.verificationGasLimit) ??
      userOp.verificationGasLimit,
    preVerificationGas:
      parseOptionalBigInt(gasOverrides.preVerificationGas) ??
      userOp.preVerificationGas,
    maxFeePerGas:
      parseOptionalBigInt(gasOverrides.maxFeePerGas) ?? userOp.maxFeePerGas,
    maxPriorityFeePerGas:
      parseOptionalBigInt(gasOverrides.maxPriorityFeePerGas) ??
      userOp.maxPriorityFeePerGas,
  };
}

export function toHexQuantity(value) {
  if (typeof value === 'string' && value.startsWith('0x')) return value;
  return `0x${BigInt(value).toString(16)}`;
}

export async function estimateGasAndSponsor({
  context,
  userOperation,
  gasOverrides = {},
}) {
  const gasPriceHex = await jsonRpcCall(context.rpcUrl, 'eth_gasPrice', []);
  const gasPrice = BigInt(gasPriceHex);
  let current = withGasFloor({
    ...userOperation,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
  });

  try {
    const estimate = await jsonRpcCall(
      context.bundlerUrl,
      'eth_estimateUserOperationGas',
      [normalizeV07UserOperation(current), AIR_ENTRYPOINT_ADDRESS],
    );
    current = applyEstimate(current, estimate);
  } catch {
    current = withGasFloor(current);
  }

  if (context.paymasterUrl) {
    const sponsor = await jsonRpcCall(
      context.paymasterUrl,
      'pm_sponsorUserOperation',
      [
        normalizeV07UserOperation(current),
        AIR_ENTRYPOINT_ADDRESS,
        { type: 'payg' },
      ],
    );
    current = {
      ...current,
      callGasLimit: sponsor.callGasLimit
        ? BigInt(sponsor.callGasLimit)
        : current.callGasLimit,
      verificationGasLimit: sponsor.verificationGasLimit
        ? BigInt(sponsor.verificationGasLimit)
        : current.verificationGasLimit,
      preVerificationGas: sponsor.preVerificationGas
        ? BigInt(sponsor.preVerificationGas)
        : current.preVerificationGas,
      paymaster: sponsor.paymaster ?? current.paymaster,
      paymasterVerificationGasLimit: sponsor.paymasterVerificationGasLimit
        ? BigInt(sponsor.paymasterVerificationGasLimit)
        : current.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: sponsor.paymasterPostOpGasLimit
        ? BigInt(sponsor.paymasterPostOpGasLimit)
        : current.paymasterPostOpGasLimit,
      paymasterData: sponsor.paymasterData ?? current.paymasterData,
    };
  }

  return applyGasOverrides(current, gasOverrides);
}

export function computeUserOpHash({ context, userOperation }) {
  const hashInput = {
    sender: userOperation.sender,
    nonce: userOperation.nonce,
    callData: userOperation.callData,
    callGasLimit: userOperation.callGasLimit,
    verificationGasLimit: userOperation.verificationGasLimit,
    preVerificationGas: userOperation.preVerificationGas,
    maxFeePerGas: userOperation.maxFeePerGas,
    maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas,
    signature: '0x',
  };
  if (userOperation.paymaster) {
    hashInput.paymaster = userOperation.paymaster;
    hashInput.paymasterVerificationGasLimit =
      userOperation.paymasterVerificationGasLimit ?? 0n;
    hashInput.paymasterPostOpGasLimit =
      userOperation.paymasterPostOpGasLimit ?? 0n;
    hashInput.paymasterData = userOperation.paymasterData ?? '0x';
  }
  return getUserOperationHash({
    chainId: context.chainId,
    entryPointAddress: AIR_ENTRYPOINT_ADDRESS,
    entryPointVersion: AIR_ENTRYPOINT_VERSION,
    userOperation: hashInput,
  });
}

export async function submitUserOperation({
  context,
  userOperation,
  wait = false,
}) {
  const result = await jsonRpcCall(
    context.bundlerUrl,
    'eth_sendUserOperation',
    [normalizeV07UserOperation(userOperation), AIR_ENTRYPOINT_ADDRESS],
  );
  if (!wait) return { userOpHash: result };

  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const receipt = await jsonRpcCall(
      context.bundlerUrl,
      'eth_getUserOperationReceipt',
      [result],
    ).catch(() => null);
    if (receipt) return { userOpHash: result, receipt };
  }
  return { userOpHash: result, receipt: null };
}

export async function buildTransferCall({
  context,
  recipient,
  amount,
  tokenAddress,
  symbol,
  decimals,
}) {
  const to = getAddress(recipient);
  if (!tokenAddress) {
    const value = parseUnits(amount, 18);
    return {
      summary: {
        asset: 'native',
        symbol: symbol ?? 'ETH',
        amount,
        recipient: to,
      },
      callData: buildExecuteCallData({ target: to, value }),
    };
  }

  const metadata = await resolveFungibleTokenMetadata({
    context,
    tokenAddress,
    symbol,
    decimals,
    standard: 'erc20',
  });
  const baseUnits = parseUnits(amount, metadata.decimals);
  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, baseUnits],
  });
  return {
    summary: {
      asset: 'erc20',
      symbol: metadata.symbol,
      tokenAddress: metadata.token,
      amount,
      amountBaseUnits: baseUnits.toString(),
      recipient: to,
      decimals: metadata.decimals,
    },
    callData: buildExecuteCallData({
      target: metadata.token,
      value: 0n,
      data: transferData,
    }),
  };
}

export async function getAssetBalance({
  context,
  owner,
  standard,
  tokenAddress,
  tokenId,
  symbol,
  decimals,
}) {
  const account = getAddress(owner ?? context.abstractAccountAddress);
  const normalizedStandard = normalizeTokenStandard(
    standard,
    tokenAddress ? 'erc20' : 'native',
  );

  if (normalizedStandard === 'native') {
    const rawBalance = BigInt(
      await jsonRpcCall(context.rpcUrl, 'eth_getBalance', [account, 'latest']),
    );
    return {
      standard: 'native',
      owner: account,
      symbol: symbol ?? 'ETH',
      decimals: 18,
      balance: rawBalance.toString(),
      formattedBalance: formatUnits(rawBalance, 18),
    };
  }

  if (normalizedStandard === 'erc20' || normalizedStandard === 'erc404') {
    const metadata = await resolveFungibleTokenMetadata({
      context,
      tokenAddress,
      symbol,
      decimals,
      standard: normalizedStandard,
    });
    const rawBalance = BigInt(
      await readContract({
        context,
        address: metadata.token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account],
      }),
    );
    return {
      standard: normalizedStandard,
      owner: account,
      tokenAddress: metadata.token,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      balance: rawBalance.toString(),
      formattedBalance: formatUnits(rawBalance, metadata.decimals),
    };
  }

  if (normalizedStandard === 'erc721') {
    if (!tokenAddress)
      throw new Error('token-address is required for erc721 balance checks');
    const token = getAddress(tokenAddress);
    const collectionBalance = BigInt(
      await readContract({
        context,
        address: token,
        abi: erc721Abi,
        functionName: 'balanceOf',
        args: [account],
      }),
    );
    const summary = {
      standard: 'erc721',
      owner: account,
      tokenAddress: token,
      balance: collectionBalance.toString(),
    };
    if (tokenId === undefined) return summary;
    const ownerOfToken = await readContract({
      context,
      address: token,
      abi: erc721Abi,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    }).catch(() => null);
    return {
      ...summary,
      tokenId: String(tokenId),
      tokenOwner: ownerOfToken,
      ownsTokenId:
        ownerOfToken != null
          ? ownerOfToken.toLowerCase() === account.toLowerCase()
          : false,
    };
  }

  if (normalizedStandard === 'erc1155') {
    if (!tokenAddress)
      throw new Error('token-address is required for erc1155 balance checks');
    if (tokenId === undefined)
      throw new Error('token-id is required for erc1155 balance checks');
    const token = getAddress(tokenAddress);
    const rawBalance = BigInt(
      await readContract({
        context,
        address: token,
        abi: erc1155Abi,
        functionName: 'balanceOf',
        args: [account, BigInt(tokenId)],
      }),
    );
    return {
      standard: 'erc1155',
      owner: account,
      tokenAddress: token,
      tokenId: String(tokenId),
      balance: rawBalance.toString(),
    };
  }

  throw new Error(`Unsupported standard for balance: ${normalizedStandard}`);
}

export async function buildApproveCall({
  context,
  standard,
  tokenAddress,
  spender,
  amount,
  decimals,
  tokenId,
  approveAll,
  approved,
  symbol,
}) {
  if (!tokenAddress) throw new Error('token-address is required for approvals');
  const normalizedStandard = normalizeTokenStandard(standard, 'erc20');
  const token = getAddress(tokenAddress);
  const operator = getAddress(spender);
  const approvedFlag = parseBooleanish(approved, true);

  if (normalizedStandard === 'erc20' || normalizedStandard === 'erc404') {
    const metadata = await resolveFungibleTokenMetadata({
      context,
      tokenAddress: token,
      symbol,
      decimals,
      standard: normalizedStandard,
    });
    const baseUnits = parseUnits(
      assertRequired(amount, 'amount is required for fungible approve'),
      metadata.decimals,
    );
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [operator, baseUnits],
    });
    return {
      summary: {
        action: 'approve',
        standard: normalizedStandard,
        tokenAddress: metadata.token,
        symbol: metadata.symbol,
        spender: operator,
        amount,
        amountBaseUnits: baseUnits.toString(),
        decimals: metadata.decimals,
      },
      callData: buildExecuteCallData({
        target: metadata.token,
        value: 0n,
        data: approveData,
      }),
    };
  }

  if (normalizedStandard === 'erc721') {
    const useApproveAll = parseBooleanish(approveAll, false);
    const approveData = useApproveAll
      ? encodeFunctionData({
          abi: erc721Abi,
          functionName: 'setApprovalForAll',
          args: [operator, approvedFlag],
        })
      : encodeFunctionData({
          abi: erc721Abi,
          functionName: 'approve',
          args: [
            operator,
            BigInt(
              assertRequired(
                tokenId,
                'token-id is required for erc721 approve',
              ),
            ),
          ],
        });
    return {
      summary: useApproveAll
        ? {
            action: 'setApprovalForAll',
            standard: 'erc721',
            tokenAddress: token,
            operator,
            approved: approvedFlag,
          }
        : {
            action: 'approve',
            standard: 'erc721',
            tokenAddress: token,
            spender: operator,
            tokenId: String(tokenId),
          },
      callData: buildExecuteCallData({
        target: token,
        value: 0n,
        data: approveData,
      }),
    };
  }

  if (normalizedStandard === 'erc1155') {
    const approveData = encodeFunctionData({
      abi: erc1155Abi,
      functionName: 'setApprovalForAll',
      args: [operator, approvedFlag],
    });
    return {
      summary: {
        action: 'setApprovalForAll',
        standard: 'erc1155',
        tokenAddress: token,
        operator,
        approved: approvedFlag,
      },
      callData: buildExecuteCallData({
        target: token,
        value: 0n,
        data: approveData,
      }),
    };
  }

  throw new Error(
    `Unsupported standard for approve: ${normalizedStandard}. For custom ERC404 variants, use air-execute.mjs if approve is non-standard.`,
  );
}

export async function buildNftTransferCall({
  context,
  standard,
  tokenAddress,
  recipient,
  tokenId,
  amount,
  data = '0x',
}) {
  const normalizedStandard = normalizeTokenStandard(standard);
  const token = getAddress(
    assertRequired(tokenAddress, 'token-address is required for NFT transfers'),
  );
  const to = getAddress(
    assertRequired(recipient, 'recipient is required for NFT transfers'),
  );
  const from = getAddress(
    assertRequired(
      context.abstractAccountAddress,
      'abstractAccountAddress is required for NFT transfers',
    ),
  );
  const id = BigInt(
    assertRequired(tokenId, 'token-id is required for NFT transfers'),
  );

  if (normalizedStandard === 'erc721') {
    const transferData = encodeFunctionData({
      abi: erc721Abi,
      functionName: 'safeTransferFrom',
      args: [from, to, id],
    });
    return {
      summary: {
        action: 'transfer',
        standard: 'erc721',
        tokenAddress: token,
        sender: from,
        recipient: to,
        tokenId: id.toString(),
      },
      callData: buildExecuteCallData({
        target: token,
        value: 0n,
        data: transferData,
      }),
    };
  }

  if (normalizedStandard === 'erc1155') {
    const quantity = BigInt(
      assertRequired(amount, 'amount is required for erc1155 transfers'),
    );
    const transferData = encodeFunctionData({
      abi: erc1155Abi,
      functionName: 'safeTransferFrom',
      args: [from, to, id, quantity, data],
    });
    return {
      summary: {
        action: 'transfer',
        standard: 'erc1155',
        tokenAddress: token,
        sender: from,
        recipient: to,
        tokenId: id.toString(),
        amount: quantity.toString(),
        data,
      },
      callData: buildExecuteCallData({
        target: token,
        value: 0n,
        data: transferData,
      }),
    };
  }

  throw new Error(
    `Unsupported NFT transfer standard: ${normalizedStandard}. For ERC404 variants, use air-execute.mjs if the contract exposes custom NFT transfer methods.`,
  );
}

export async function prepareAndSignUserOperation({
  context,
  keys,
  callData,
  gasOverrides = {},
}) {
  const validatorAddress = await getLegacyValidatorAddress({ context });
  const nonce = await getAccountNonce({ context, validatorAddress });
  const dummySignature = `0x${'ff'.repeat(65)}`;
  const initial = {
    sender: context.abstractAccountAddress,
    nonce,
    callData,
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
    paymaster: undefined,
    paymasterVerificationGasLimit: undefined,
    paymasterPostOpGasLimit: undefined,
    paymasterData: undefined,
    signature: dummySignature,
  };
  const finalUserOperation = await estimateGasAndSponsor({
    context,
    userOperation: initial,
    gasOverrides,
  });
  const userOpHash = computeUserOpHash({
    context,
    userOperation: finalUserOperation,
  });
  const airSigned = await signWithAir({
    context,
    keys,
    method: 'personal_sign',
    payload: userOpHash,
  });
  return {
    validatorAddress,
    userOpHash,
    userOperation: {
      ...finalUserOperation,
      signature: airSigned.signature,
    },
    airRequest: airSigned.request,
  };
}

export function printJson(value) {
  console.log(
    JSON.stringify(
      value,
      (_key, currentValue) =>
        typeof currentValue === 'bigint'
          ? currentValue.toString()
          : currentValue,
      2,
    ),
  );
}

export function buildChainSummary(context) {
  return {
    chainId: context.chainId,
    rpcUrl: context.rpcUrl,
    bundlerUrl: context.bundlerUrl,
    paymasterUrl: context.paymasterUrl ?? null,
    entryPointVersion: AIR_ENTRYPOINT_VERSION,
    entryPointAddress: AIR_ENTRYPOINT_ADDRESS,
  };
}

export function assertRequired(value, message) {
  if (value === undefined || value === null || value === '') {
    throw new Error(message);
  }
  return value;
}
