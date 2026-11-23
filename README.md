# Veritas — Decentralized Academic Credential & Skill Verification System

Veritas is a working implementation of a trustless academic-credential network. Universities issue digitally signed degree credentials to self-sovereign student identities, anchor an entire graduating cohort with a single Merkle root, and verifiers — faculty or employers — check any credential in seconds without contacting the university.

The repository contains the complete system described in the mini-project report: Solidity contracts, a Hardhat deployment and evaluation suite, a shared TypeScript cryptographic library, and a React application with three role-scoped workspaces for administrators, teachers and students.

## Key capabilities

- **Self-sovereign academic identity.** Each student holds a `did:ethr` identifier derived from their own secp256k1 keypair. Credentials are bound to that identifier and stored in the holder's wallet.
- **Cohort-scale issuance.** A university hashes an entire graduating class into a sorted-pair Merkle tree, signs the root with ECDSA using EIP-712 typed data, and anchors the root in one transaction.
- **Lightweight verification.** A teacher or employer validates a single credential with a short Merkle proof and two read-only contract calls. No registrar email, background-check agency or personal data disclosure is required.
- **Role-based access.** Accounts are created in the interface, not preloaded: users register as an administrator, teacher or student and sign in with a password. Administrator, teacher and student accounts share one network but receive different workspaces and permissions: the registrar's office issues batches and manages the directory, teachers verify and see only their own departments, and students hold and present only their own credentials.
- **Degree catalogue.** Batches can be issued for B.Tech, B.E., B.Sc., BBA, B.Com., BCA, M.Tech, M.Sc., MBA, MCA and Ph.D. awards.
- **Tamper evidence.** Every credential field is committed with an EIP-712 hash. Altering any field breaks the commitment and the issuer attestation, so a forged presentation is rejected.
- **Issuer accreditation.** Only universities on the on-chain allow-list can anchor batches; deactivating an issuer blocks new batches while historical credentials remain verifiable.

## Documentation

- [Mini-project report (DOCX)](docs/Veritas-MiniProject-Report.docx) — submission-ready, follows the Presidency University mini-project template
- [Mini-project report (PDF)](docs/Veritas-MiniProject-Report.pdf)
- [Mini-project report (Markdown source)](docs/mini-project-report.md)
- [Benchmark results](docs/benchmark-results.md)

The report covers the introduction, literature survey, research gaps, methodology, objectives, system design and implementation, outcomes, results and discussion, conclusion and future work, with IEEE-style references.

## Quick start

Requirements: Node.js 20+ (tested on Node 24/26) and two terminals.

```bash
npm install

# terminal 1 — local Ethereum development chain
npm run chain

# terminal 2 — deploy contracts and issue the sample cohort
npm run setup
npm run dev
```

Open http://localhost:5173.

`npm run setup` deploys both registries, registers *Presidency University* as the accredited issuer, builds a five-credential B.Tech sample cohort, signs the Merkle root, anchors it on-chain, verifies every issued credential, and writes the sample credentials to `web/public/sample-credentials.json`. The sample bundle is used by the teacher desk's *Sample credential* action. Real administrator, teacher and student accounts are created from the sign-in screen.

## Using the application

1. **Create an account or sign in.** The interface opens on a sign-in screen with two tabs. *Create account* asks for a role (administrator, teacher or student), a name, a username and a password; teachers also choose a title and at least one department, and students choose a field of study. Passwords are stored as salted PBKDF2-SHA-256 hashes, never in plain text. Sign in with the same username and password afterwards; the session is remembered until you select *Sign out*. The top bar shows the signed-in name and role at all times.
2. **Administrator workspace** — choose a degree and graduation year, select the graduates, and run *Hash, sign & anchor*. The pipeline hashes each credential, builds the Merkle tree, signs the root, submits one `issueBatch` transaction, self-checks every proof against the contract, and delivers credentials to the student wallets. The institution directory lists every member, their role, and the full permission matrix; the registrar can also enroll a new member with a temporary password from the *Enroll a member* form.
3. **Student workspace** — the signed-in holder sees their DID, degree certificate, Merkle proof path and presentation package. *Present to faculty* forwards the credential JSON to the teacher workspace.
4. **Teacher workspace** — the faculty view lists students in the teacher's own departments and accepts a presented credential. *Verify credential* runs seven checks: credential structure, DID binding, issuer authorization, ECDSA attestation, credential commitment, Merkle inclusion and the on-chain anchor. The result is a verdict with per-check timings. The *Simulate forgery* option alters the degree fields to demonstrate that tampering is detected. Teachers cannot issue, edit or delete credentials.

Verification uses only read-only `eth_call`s: the verifier pays no gas and does not contact the university.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run chain` | Start the Hardhat JSON-RPC node on `127.0.0.1:8545` (chain 31337) |
| `npm run compile` | Compile the contracts |
| `npm test` | Contract and cryptography test suite (7 tests) |
| `npm run deploy` | Deploy the registries, register the university, write `web/src/generated/deployment.json` |
| `npm run seed` | Issue the sample cohort on the running chain and write `web/public/sample-credentials.json` |
| `npm run setup` | `deploy` + `seed` |
| `npm run bench` | Benchmark tree construction, proofs and verification for 1–1,000 credentials; writes `docs/benchmark-results.md` |
| `npx hardhat run scripts/verify-live.ts --network localhost` | Verify a stored credential and a forged copy against the running chain |
| `npm run dev` | Vite development server |
| `npm run build` | Production build of the interface |

After changing contracts, restart the chain (or redeploy) and re-run `npm run setup`. The interface scopes wallet storage to the deployed registry address.

## Architecture

```
Administrator (registrar)               Student wallet               Teacher / employer verifier
        │                                     │                                   │
        │ 1. EIP-712 leaf per credential      │                                   │
        │ 2. Merkle tree → root               │                                   │
        │ 3. ECDSA sign root                  │                                   │
        │ 4. issueBatch(root) ──► CredentialRegistry ◄── 6. batch(id) ───────────┤
        │ 5. deliver VC {fields,              │        verifyCredential()         │
        │    proof, root, signature} ─────────►│  presentation ───────────────────►│
        │                                     │                                   │ 7. seven checks
        │                                     │                                   │    → verdict + ms
```

### Contracts

| Contract | Responsibility |
| --- | --- |
| `UniversityRegistry.sol` | Owner-managed allow-list of accredited issuers. Deactivation stops new batches while historical roots remain verifiable. |
| `CredentialRegistry.sol` | Stores one `Batch` per issuance (`issuer`, `merkleRoot`, `credentialCount`, `issuedAt`, `graduationYear`, `degreeType`) and verifies OpenZeppelin-compatible sorted-pair Merkle proofs through `verifyCredential`. |

On-chain state is O(1) per cohort: one root and a small metadata struct, independent of class size.

### Cryptographic design

- **Leaf** — EIP-712 hash of `{issuer, studentDid, studentName, degreeType, fieldOfStudy, graduationYear, credentialId}` under domain `AcademicCredential v1`.
- **Tree** — sorted-pair `keccak256` Merkle tree with odd-node promotion, compatible with OpenZeppelin `MerkleProof.verify` and any standard verifier.
- **Attestation** — the university signs `BatchAttestation {merkleRoot, credentialCount, degreeType, graduationYear}` with EIP-712; the domain binds the registry address and chain ID, preventing cross-chain and cross-contract replay.
- **Presentation** — the credential JSON contains the fields, leaf, Merkle proof, root, attestation signature, batch ID and transaction hash. A verifier needs nothing else.

Shared implementations live in [`shared/`](shared): `merkle.ts`, `credential.ts` and `verify.ts`. The same code runs in the Hardhat scripts and in the browser, so the tests and the interface exercise identical logic.

### Roles on the development network

The interface runs against the Hardhat development mnemonic (`test test … junk`). Contract-level roles are fixed by the deployment; application accounts are created in the interface:

| Contract key | Role | Permissions |
| --- | --- | --- |
| 0 | Registry owner | Governance of the issuer allow-list |
| 1 | Institution issuer (Presidency University) | Signs batch attestations; registered in `UniversityRegistry` |
| 2–6 | Sample cohort signers | Used by the seeding script for the sample batch |

Application accounts carry the workspace permissions:

| Account type | Permissions |
| --- | --- |
| Administrator | Issue batches, manage the directory, view all records, view departments, verify |
| Teacher | View students in their own departments, verify presentations |
| Student | Hold and present their own credentials |

An administrator account binds to the institution issuer key, so credentials it signs pass the issuer-authorization check. A student or teacher account generates its own key pair and receives a fresh `did:ethr` address at registration. Passwords are hashed with PBKDF2-SHA-256 (150,000 iterations) through the Web Crypto API; only the salt and hash are stored. A production deployment replaces test keys with an issuer HSM and real holder wallets such as MetaMask, mobile wallets or passkey-based signers.

## Evaluation

| Measure | Result |
| --- | --- |
| Test suite | 7 passing |
| Anchoring a 1,000-credential cohort | ~126,000 gas in one transaction (~126 gas per credential) |
| Proof size for 1,000 credentials | 10 sibling hashes |
| Off-chain proof verification | under 1 ms |
| End-to-end verification on a local node | well under one second |

Full measurements are in [docs/benchmark-results.md](docs/benchmark-results.md) and in Chapter 8 of the report.

## Repository layout

```
contracts/            Solidity contracts
shared/               Merkle tree, EIP-712 credential and attestation, verification pipeline
scripts/              deploy.ts, seed.ts, bench.ts, verify-live.ts
test/                 Hardhat test suite
web/                  Vite + React application (three role workspaces)
docs/                 Mini-project report, figures, benchmark results
```

## Known limitations

- **Revocation** — issuer deactivation is supported, but individual credentials cannot be revoked. A production system would add a revocation registry or status list.
- **Holder proof of possession** — verification confirms that a credential is bound to a DID, but presentation does not yet require a fresh holder signature over a verifier nonce.
- **Issuer key custody** — development keys live in the browser; production issuers must use an HSM or remote signer.
- **On-chain metadata** — degree type and graduation year are stored in plaintext for transparency. A production deployment could commit metadata to a content hash instead.
- **Network** — the reference deployment targets a local development chain; a public deployment would use an L2 network and a production RPC provider.
