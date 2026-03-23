import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import process from 'node:process';

// ---------------------------------------------------------------------------
// Staging defaults
// ---------------------------------------------------------------------------

export const STAGING_DEFAULTS = {
  airApiUrl: 'https://air.api.staging.air3.com/v2',
  mocaChainApiUrl: 'https://api.staging.mocachain.org/v1',
  vpApiUrl: 'https://vp.api.staging.moca.network/v1',
  mocaProofApiUrl: 'https://proof.api.staging.moca.network/v1',
  partnerId: '7e9becac-db0d-4d52-980e-984bb70c4d30',
};

const DEFAULT_CONFIG_PATH = '.air-wallet-config.json';
const DEFAULT_PRIVATE_KEY_PATH = 'p256-private-key.pem';
const DEFAULT_PUBLIC_KEY_PATH = 'p256-public-key.pem';

// ---------------------------------------------------------------------------
// CLI argument parser
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

async function readJsonIfExists(path) {
  try {
    const content = await fs.readFile(path, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function stripTrailingSlash(url) {
  return String(url).replace(/\/+$/, '');
}

function ensureApiVersion(url, versionSegment) {
  const normalized = stripTrailingSlash(url);
  if (new RegExp(`/${versionSegment}$`, 'i').test(normalized)) {
    return normalized;
  }
  return `${normalized}/${versionSegment}`;
}

export async function loadMocaContext(args = {}, opts = {}) {
  const requireUserId = opts.requireUserId ?? true;
  const fileConfig = await readJsonIfExists(args.config ?? DEFAULT_CONFIG_PATH);

  const rawAirApiUrl =
    args['air-api-url'] ??
    process.env.MOCA_AIR_API_URL ??
    fileConfig.airApiUrl ??
    STAGING_DEFAULTS.airApiUrl;
  const rawMocaChainApiUrl =
    args['chain-api-url'] ??
    process.env.MOCA_CHAIN_API_URL ??
    fileConfig.mocaChainApiUrl ??
    STAGING_DEFAULTS.mocaChainApiUrl;
  const rawVpApiUrl =
    args['vp-api-url'] ??
    process.env.MOCA_VP_API_URL ??
    fileConfig.vpApiUrl ??
    STAGING_DEFAULTS.vpApiUrl;
  const rawMocaProofApiUrl =
    args['proof-api-url'] ??
    process.env.MOCA_PROOF_API_URL ??
    fileConfig.mocaProofApiUrl ??
    STAGING_DEFAULTS.mocaProofApiUrl;

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
    partnerId:
      args['partner-id'] ??
      process.env.MOCA_PARTNER_ID ??
      fileConfig.partnerId ??
      STAGING_DEFAULTS.partnerId,

    // Endpoint URLs with staging fallbacks
    airApiUrl: ensureApiVersion(rawAirApiUrl, 'v2'),
    mocaChainApiUrl: ensureApiVersion(rawMocaChainApiUrl, 'v1'),
    vpApiUrl: ensureApiVersion(rawVpApiUrl, 'v1'),
    mocaProofApiUrl: ensureApiVersion(rawMocaProofApiUrl, 'v1'),
  };

  if (requireUserId && !merged.userId) {
    throw new Error(
      'Missing Moca context. Provide userId via .air-wallet-config.json, env, or CLI flags.',
    );
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Agent key loader
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// P-256 signing helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export async function fetchJson(url, opts = {}) {
  const response = await fetch(url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) {
    const err = new Error(`${response.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function postJson(url, body, headers = {}) {
  return fetchJson(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

export async function getJson(url, headers = {}) {
  return fetchJson(url, { method: 'GET', headers });
}

export function bearerHeaders(accessToken) {
  return { authorization: `Bearer ${accessToken}` };
}

// ---------------------------------------------------------------------------
// Verify-response normalizer
// ---------------------------------------------------------------------------

const KNOWN_STATUS_NO_VC = ['NO_EXIST'];

export function normalizeVerifyResponse(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { normalized: 'unknown_response', raw };
  }

  const { verified, status, code, reason } = raw;

  if (verified === true) {
    return { normalized: 'compliant', raw };
  }

  if (verified === 'pending') {
    return { normalized: 'processing', raw };
  }

  if (verified === false) {
    if (typeof reason === 'string') {
      const normalizedReason = reason.toUpperCase();
      if (normalizedReason === 'NO_CREDENTIAL') {
        return { normalized: 'no_vc', reason: normalizedReason, raw };
      }
      if (normalizedReason === 'NOT_COMPLIANT') {
        return {
          normalized: 'non_compliant',
          reason: normalizedReason,
          raw,
        };
      }
      return {
        normalized: `status_bucket:${normalizedReason}`,
        status: normalizedReason,
        raw,
      };
    }

    if (status && KNOWN_STATUS_NO_VC.includes(status)) {
      return { normalized: 'no_vc', status, raw };
    }
    if (status === 'NON_COMPLIANT') {
      return { normalized: 'non_compliant', status, raw };
    }
    if (status) {
      return { normalized: `status_bucket:${status}`, status, raw };
    }
    if (code) {
      return { normalized: `unknown_failure_code:${code}`, code, raw };
    }
    return { normalized: 'unknown_response', raw };
  }

  return { normalized: 'unknown_response', raw };
}

// ---------------------------------------------------------------------------
// Moca proof completion helpers
// ---------------------------------------------------------------------------

// Salt used for completion request checksum generation.
export const MOCAPROOF_CHECKSUM_SALT =
  'fzUkU81NiVV4kJH6C9+szvEmQvL5o5VQbaZj6Q3jIrU=';
export const DEFAULT_TX_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
export const DEFAULT_QUERY_MATCH_ZKP =
  '{"mode":"query_match","proof":"not_provided"}';

export function buildMocaProofChecksum({
  userId,
  programId,
  txHash = '',
  saltKey = MOCAPROOF_CHECKSUM_SALT,
}) {
  const normalizedTxHash = String(txHash).toLowerCase();
  const input = [userId, programId, normalizedTxHash, saltKey].join('.');
  const md5str = crypto.createHash('md5').update(input, 'utf8').digest('hex');
  return Buffer.from(md5str, 'utf8').toString('base64');
}

export function extractTxHashFromVerifyResponse(rawResponse) {
  const candidates = [
    rawResponse?.txHash,
    rawResponse?.transactionHash,
    rawResponse?.result?.txHash,
    rawResponse?.result?.transactionHash,
    rawResponse?.proofs?.[0]?.txHash,
    rawResponse?.proofs?.[0]?.transactionHash,
  ];
  const txHash = candidates.find(
    (value) => typeof value === 'string' && value.length > 0,
  );
  // Use a deterministic zero-hash default when unavailable.
  return txHash ?? DEFAULT_TX_HASH;
}

export function extractZkpStringFromVerifyResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'object') return undefined;
  if (typeof rawResponse.zkp === 'string') return rawResponse.zkp;
  if (Array.isArray(rawResponse.proofs) && rawResponse.proofs.length > 0) {
    return JSON.stringify(rawResponse.proofs[0]);
  }
  if (rawResponse.proofs !== undefined) {
    return JSON.stringify(rawResponse.proofs);
  }
  return undefined;
}

export function ensureZkpLength(zkp, maxLength = 10_000) {
  if (zkp === undefined) return undefined;
  if (typeof zkp !== 'string') {
    throw new Error('zkp must be a string when provided');
  }
  if (zkp.length > maxLength) {
    throw new Error(
      `zkp payload exceeds ${maxLength} characters (actual: ${zkp.length})`,
    );
  }
  return zkp;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

export function printJson(value) {
  console.log(
    JSON.stringify(
      value,
      (_key, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    ),
  );
}

export function assertRequired(value, message) {
  if (value === undefined || value === null || value === '') {
    throw new Error(message);
  }
  return value;
}
