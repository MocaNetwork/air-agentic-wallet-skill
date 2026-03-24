# AIR Agentic Skills

This repository packages reusable agent skills so users can install them with:

```bash
npx skills add <owner/repo>
```

All skills are installed together.

## What this repo contains

### 1. `air-agentic-wallet`

- `skills/air-agentic-wallet/SKILL.md`: skill instructions for operating AIR agentic wallets
- `skills/air-agentic-wallet/scripts/*.mjs`: helper scripts for signing, balances, transfers, approvals, NFT transfers, and arbitrary execution

### 2. `moca-credential-verifier` (Beta)

- `skills/moca-credential-verifier/SKILL.md`: skill instructions for Moca chain credential verification
- `skills/moca-credential-verifier/scripts/*.mjs`: helper scripts for scoped sessions, program listing, credential verification in query_match mode, and optional status polling

### 3. `moca-proof` (Beta)

- `skills/moca-proof/SKILL.md`: skill instructions for program completion and MoCat progression
- `skills/moca-proof/scripts/*.mjs`: helper scripts for completing verified programs with checksum and fetching MoCat status

## Install

After publishing this repository, install it with:

```bash
npx skills add <owner/repo>
```

## Skill purposes

**air-agentic-wallet** helps an external agent operate AIR agentic wallets by:

- generating fresh AIR auth payloads
- requesting wallet signatures from AIR's `POST /v2/wallet/agent-sign` endpoint
- preparing and submitting ERC-4337 UserOps for common wallet actions

**moca-credential-verifier (Beta)** helps an external agent verify credentials on Moca chain by:

- creating scoped AIR sessions for credential verification
- listing and browsing available verification programs
- triggering credential verification via `moca-chain-api /credentials/verify-by-agent` in `query_match` mode

**moca-proof (Beta)** helps an external agent complete verified programs and track MoCat progression by:

- submitting completion payload to `moca-proof-api /mocaproof/complete`
- fetching MoCat status and progression details

After credential verification returns `compliant`, the agent uses `moca-proof` to complete the program and display MoCat progression.

Staging defaults:

| Service | URL |
|---------|-----|
| AIR API | `https://air.api.staging.air3.com/v2` |
| Moca Chain API | `https://api.staging.mocachain.org/v1` |
| VP API | `https://vp.api.staging.moca.network/v1` |
| Moca Proof API | `https://proof.api.staging.moca.network/v1` |

Beta status: currently configured for staging endpoints.

Default `partnerId` for `moca-credential-verifier` and `moca-proof`:

- `7e9becac-db0d-4d52-980e-984bb70c4d30`

## Testing and support

We have tested the wallet skill on Base Sepolia (`84532`) only.

Supported networks are AIR-supported EVM chains that also have public Candide EIP-4337 bundler coverage.

For detailed coverage, support boundaries, and validated harness/model information, see [`TESTING_AND_SUPPORT.md`](./TESTING_AND_SUPPORT.md).

## Repo structure

```text
skills/
  air-agentic-wallet/
    SKILL.md
    scripts/
      air-common.mjs
      air-personal-sign.mjs
      air-sign-typed-data.mjs
      air-balance.mjs
      air-send.mjs
      air-approve.mjs
      air-nft-transfer.mjs
      air-execute.mjs
  moca-credential-verifier/
    SKILL.md
    scripts/
      moca-common.mjs
      moca-create-session.mjs
      moca-list-programs.mjs
      moca-verify-by-agent.mjs
      moca-poll-status.mjs
  moca-proof/
    SKILL.md
    scripts/
      moca-common.mjs
      moca-complete-program.mjs
      moca-get-mocat.mjs
```

## Local files

The bundled scripts resolve key paths from CLI flags, environment variables, or `.air-wallet-config.json`, and read PEM keys from those paths (commonly `p256-private-key.pem` and `p256-public-key.pem` in the working directory). Local key and config files are intentionally ignored by git.

Generate the P-256 key pair (run in your working directory):

```bash
# Generate a P-256 (secp256r1 / prime256v1) private key
openssl ecparam -name prime256v1 -genkey -noout -out p256-private-key.pem

# Derive the matching public key
openssl ec -in p256-private-key.pem -pubout -out p256-public-key.pem
```

Optional check:

```bash
openssl ec -in p256-private-key.pem -text -noout
openssl ec -pubin -in p256-public-key.pem -text -noout
```

## Notes

- Keep skill implementation files inside `skills/`.
- Put repository-level documentation and metadata at the repo root.
- If you run the bundled Node scripts directly in a project, make sure that project has the required runtime dependencies available, including `viem`.
