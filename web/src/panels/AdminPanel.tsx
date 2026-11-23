import { useState, type FormEvent } from "react";
import { credentialLeaf, didForAddress, signBatchAttestation } from "@shared/credential";
import { buildMerkleTree, getProof } from "@shared/merkle";
import { verifyPresentation } from "@shared/verify";
import type { VerifiableCredential } from "@shared/types";
import {
  CHAIN_ID,
  DEGREE_TYPES,
  adminAddress,
  credentialRegistryFor,
  deployment,
  provider,
  universityName,
  universitySigner
} from "../config";
import { registerAccount } from "../lib/auth";
import {
  DEPARTMENTS,
  PERMISSIONS,
  ROLE_INFO,
  TEACHER_TITLES,
  type Account,
  type Role
} from "../lib/roles";
import type { WalletMap } from "../lib/walletStore";
import { AccessList, CopyButton, Hash, RolePill, Spinner } from "../ui";

interface Stage {
  key: string;
  label: string;
  hint: string;
  detail?: string;
  ms?: number;
  status: "pending" | "active" | "done" | "error";
}

export interface IssuedBatch {
  batchId: number;
  root: string;
  txHash: string;
  gas: string;
  signature: string;
  count: number;
  degreeType: string;
  graduationYear: number;
}

const STAGE_SEEDS: Omit<Stage, "status">[] = [
  { key: "hash", label: "Commit each degree", hint: "One EIP-712 leaf per credential" },
  { key: "tree", label: "Build the Merkle tree", hint: "Sorted-pair keccak256" },
  { key: "sign", label: "Sign the root", hint: "ECDSA secp256k1 attestation" },
  { key: "anchor", label: "Anchor on-chain", hint: "A single issueBatch transaction" },
  { key: "check", label: "Independent self-check", hint: "Proof checked against the contract" },
  { key: "deliver", label: "Deliver to wallets", hint: "Credentials written into student DIDs" }
];

const initialStages = (): Stage[] => STAGE_SEEDS.map((stage) => ({ ...stage, status: "pending" }));

export default function AdminPanel({
  account,
  students,
  members,
  wallet,
  onIssued,
  onDirectoryChanged
}: {
  account: Account;
  students: Account[];
  members: Account[];
  wallet: WalletMap;
  onIssued: (credentials: VerifiableCredential[]) => void;
  onDirectoryChanged: () => void;
}) {
  const [degreeType, setDegreeType] = useState(DEGREE_TYPES[0]);
  const [year, setYear] = useState(2026);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<IssuedBatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cohort = students.filter((student) => !excluded.includes(student.address.toLowerCase()));

  const toggle = (address: string) => {
    const key = address.toLowerCase();
    setExcluded((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const patch = (key: string, value: Partial<Stage>) => {
    setStages((current) => current.map((stage) => (stage.key === key ? { ...stage, ...value } : stage)));
  };

  const elapsed = (started: number) => Math.round(performance.now() - started);

  const issueBatch = async () => {
    if (busy) return;
    if (cohort.length === 0) {
      setError("Select at least one graduate for the cohort.");
      return;
    }

    setBusy(true);
    setError(null);
    setReceipt(null);
    setStages(initialStages());

    try {
      patch("hash", { status: "active" });
      const hashStart = performance.now();
      const salt = Math.random().toString(36).slice(2, 6).toUpperCase();
      const credentials = cohort.map((student, index) => ({
        issuer: adminAddress,
        studentDid: didForAddress(student.address),
        studentName: student.name,
        degreeType,
        fieldOfStudy: student.field ?? "",
        graduationYear: year,
        credentialId: `VT-${year}-${salt}-${String(index + 1).padStart(2, "0")}`
      }));
      const leaves = credentials.map(credentialLeaf);
      patch("hash", {
        status: "done",
        ms: elapsed(hashStart),
        detail: `${leaves.length} degree commitments hashed`
      });

      patch("tree", { status: "active" });
      const treeStart = performance.now();
      const tree = buildMerkleTree(leaves);
      patch("tree", { status: "done", ms: elapsed(treeStart), detail: `Root ${tree.root.slice(0, 12)}…` });

      patch("sign", { status: "active" });
      const signStart = performance.now();
      const university = universitySigner();
      const contract = credentialRegistryFor(university);
      const attestation = {
        merkleRoot: tree.root,
        credentialCount: credentials.length,
        degreeType,
        graduationYear: year
      };
      const attestationSignature = await signBatchAttestation(
        university,
        CHAIN_ID,
        deployment.contracts.credentialRegistry.address,
        attestation
      );
      patch("sign", {
        status: "done",
        ms: elapsed(signStart),
        detail: `65-byte signature · signer ${university.address.slice(0, 10)}…`
      });

      patch("anchor", { status: "active" });
      const anchorStart = performance.now();
      const tx = await contract.issueBatch(tree.root, credentials.length, year, degreeType);
      const txReceipt = await tx.wait();
      if (!txReceipt) throw new Error("Batch transaction was not mined");

      const batchEvent = txReceipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "BatchIssued");
      if (!batchEvent) throw new Error("BatchIssued event missing from the receipt");
      const batchId = Number(batchEvent.args.batchId);
      const block = await provider.getBlock(txReceipt.blockNumber);
      patch("anchor", {
        status: "done",
        ms: elapsed(anchorStart),
        detail: `Batch #${batchId} · gas ${txReceipt.gasUsed.toLocaleString("en-US")}`
      });

      const vcs: VerifiableCredential[] = credentials.map((credential, index) => ({
        version: "1.0",
        chainId: CHAIN_ID,
        verifyingContract: deployment.contracts.credentialRegistry.address,
        batchId,
        credentialCount: credentials.length,
        merkleRoot: tree.root,
        leaf: leaves[index],
        proof: getProof(tree, index),
        attestationSignature,
        issuedAt: block?.timestamp ?? Math.floor(Date.now() / 1000),
        txHash: txReceipt.hash,
        credential
      }));

      patch("check", { status: "active" });
      const checkStart = performance.now();
      const reports = await Promise.all(
        vcs.map((vc) =>
          verifyPresentation(vc, {
            provider,
            credentialRegistry: deployment.contracts.credentialRegistry.address,
            universityRegistry: deployment.contracts.universityRegistry.address
          })
        )
      );
      const passed = reports.filter((report) => report.ok).length;
      if (passed !== vcs.length) throw new Error(`Self-check failed for ${vcs.length - passed} credential(s)`);
      patch("check", {
        status: "done",
        ms: elapsed(checkStart),
        detail: `${passed}/${vcs.length} proofs accepted by the contract`
      });

      patch("deliver", { status: "active" });
      const deliverStart = performance.now();
      onIssued(vcs);
      patch("deliver", {
        status: "done",
        ms: elapsed(deliverStart),
        detail: `${vcs.length} credentials delivered to ${universityName} graduates`
      });

      setReceipt({
        batchId,
        root: tree.root,
        txHash: txReceipt.hash,
        gas: txReceipt.gasUsed.toLocaleString("en-US"),
        signature: attestationSignature,
        count: vcs.length,
        degreeType,
        graduationYear: year
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setStages((current) =>
        current.map((stage) => (stage.status === "active" ? { ...stage, status: "error", detail: message } : stage))
      );
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const depth = cohort.length > 1 ? Math.ceil(Math.log2(cohort.length)) : 0;

  return (
    <div className="panel">
      <div className="work-grid">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <span className="kicker">Administrator workspace</span>
                <h2>Issue a graduation batch</h2>
              </div>
              <span className="pill pill-soft">{account.name}</span>
            </div>

            <div className="form-row">
              <label className="field">
                <span>Degree awarded</span>
                <select value={degreeType} onChange={(event) => setDegreeType(event.target.value)} disabled={busy}>
                  {DEGREE_TYPES.map((degree) => (
                    <option key={degree} value={degree}>
                      {degree}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Graduation year</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  disabled={busy}
                />
              </label>
            </div>

            <div className="roster-head">
              <span className="kicker">Cohort roster</span>
              <span className="muted small">
                {cohort.length} of {students.length} selected
              </span>
            </div>

            {students.length === 0 ? (
              <div className="roster-empty">
                <strong>No graduate accounts yet</strong>
                <p>
                  Students create their own accounts from the sign-in screen, or the registrar can enroll them from the
                  directory below. Each account contributes a DID to the batch.
                </p>
              </div>
            ) : (
              <>
                <ul className="roster">
                  {students.map((student) => {
                    const checked = !excluded.includes(student.address.toLowerCase());
                    return (
                      <li key={student.id}>
                        <label className={`roster-row${checked ? " is-selected" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(student.address)}
                            disabled={busy}
                          />
                          <span className="avatar avatar-sm">{initials(student.name)}</span>
                          <span className="roster-name">
                            <strong>{student.name}</strong>
                            <span className="mono muted">{student.address.slice(0, 10)}…</span>
                          </span>
                          <span className="roster-field">{student.field}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {error && <div className="alert alert-error">{error}</div>}

                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={issueBatch}
                  disabled={busy || cohort.length === 0}
                >
                  {busy ? (
                    <>
                      <Spinner /> Anchoring batch…
                    </>
                  ) : (
                    `Hash, sign & anchor ${cohort.length} credential${cohort.length === 1 ? "" : "s"}`
                  )}
                </button>
                <p className="hint">
                  The registrar key signs the Merkle root; individual degree records never leave the holders' wallets.
                </p>
              </>
            )}
          </section>

          <section className="card access-card">
            <div className="card-head compact">
              <div>
                <span className="kicker">Access control</span>
                <h2>Administrator permissions</h2>
              </div>
              <RolePill role="admin" />
            </div>
            <AccessList role="admin" />
            <p className="hint">
              Issuance and directory changes are limited to this workspace; faculty can verify but never create or
              edit a credential.
            </p>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <span className="kicker">Pipeline</span>
                <h2>What happens on issue</h2>
              </div>
              {busy && <Spinner />}
            </div>

            <ol className="pipeline">
              {stages.map((stage) => (
                <li key={stage.key} className={`pipe-step is-${stage.status}`}>
                  <span className="pipe-dot">{stage.status === "done" ? "✓" : stage.status === "error" ? "✕" : ""}</span>
                  <div className="pipe-body">
                    <strong>{stage.label}</strong>
                    <span>{stage.detail ?? stage.hint}</span>
                  </div>
                  {typeof stage.ms === "number" && <span className="pipe-ms">{stage.ms} ms</span>}
                </li>
              ))}
            </ol>
          </section>

          {receipt ? (
            <section className="card receipt">
              <div className="card-head">
                <div>
                  <span className="kicker">Anchored</span>
                  <h2>Batch #{receipt.batchId}</h2>
                </div>
                <span className="pill pill-success">
                  <span className="dot" /> On-chain
                </span>
              </div>
              <dl className="kv-list">
                <div>
                  <dt>Commitments</dt>
                  <dd>
                    {receipt.count} × {receipt.degreeType} · {receipt.graduationYear}
                  </dd>
                </div>
                <div>
                  <dt>Merkle root</dt>
                  <dd>
                    <Hash value={receipt.root} head={12} tail={10} /> <CopyButton value={receipt.root} />
                  </dd>
                </div>
                <div>
                  <dt>Transaction</dt>
                  <dd>
                    <Hash value={receipt.txHash} head={12} tail={10} /> <CopyButton value={receipt.txHash} />
                  </dd>
                </div>
                <div>
                  <dt>Gas</dt>
                  <dd className="mono">{receipt.gas}</dd>
                </div>
                <div>
                  <dt>Attestation</dt>
                  <dd>
                    <Hash value={receipt.signature} head={12} tail={10} /> <CopyButton value={receipt.signature} />
                  </dd>
                </div>
              </dl>
              <p className="hint">Students can now present their degrees without another registrar request.</p>
            </section>
          ) : (
            <section className="card manifest">
              <span className="kicker">Batch manifest</span>
              <div className="manifest-grid">
                <div>
                  <strong>{cohort.length}</strong>
                  <span>credentials</span>
                </div>
                <div>
                  <strong>{depth}</strong>
                  <span>proof depth</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>anchor tx</span>
                </div>
                <div>
                  <strong>ECDSA</strong>
                  <span>secp256k1</span>
                </div>
              </div>
              <p className="hint">
                Whether you issue 5 or 5,000 degrees, the registrar sends one root — verification cost stays constant.
              </p>
            </section>
          )}
        </div>
      </div>

      <section className="card directory-card">
        <div className="card-head">
          <div>
            <span className="kicker">Institution directory</span>
            <h2>Members, roles and access</h2>
          </div>
          <span className="pill pill-soft">{members.length} accounts</span>
        </div>

        <div className="directory-counts">
          {(["admin", "teacher", "student"] as const).map((role) => (
            <div key={role}>
              <strong>{members.filter((member) => member.role === role).length}</strong>
              <span>{ROLE_INFO[role].label}s</span>
            </div>
          ))}
        </div>

        <div className="table-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Administrator</th>
                <th>Teacher</th>
                <th>Student</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((permission) => (
                <tr key={permission.id}>
                  <td>{permission.label}</td>
                  {(["admin", "teacher", "student"] as const).map((role) => (
                    <td key={role} className={permission.roles.includes(role) ? "is-yes" : "is-no"}>
                      {permission.roles.includes(role) ? "Granted" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-scroll">
          <table className="directory">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Account</th>
                <th>Credentials</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="member-cell">
                    <span className="avatar avatar-sm">{initials(member.name)}</span>
                    <span className="member-copy">
                      <span>{member.name}</span>
                      <small className="member-handle">@{member.username}</small>
                    </span>
                  </td>
                  <td>
                    <RolePill role={member.role} />
                  </td>
                  <td className="muted">{member.detail}</td>
                  <td className="mono muted">
                    {member.address ? `${member.address.slice(0, 8)}…${member.address.slice(-4)}` : "—"}
                  </td>
                  <td className="mono">
                    {member.role === "student" ? wallet[member.address.toLowerCase()]?.length ?? 0 : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <EnrollMember onEnrolled={onDirectoryChanged} />

        <p className="hint">
          Roles follow the institution's real responsibilities: the registry issues, enrolls and audits, faculty read and
          verify, students hold and present. Degrees on offer include B.Tech, BBA, B.Com., BCA, M.Tech and MBA.
        </p>
      </section>
    </div>
  );
}

function EnrollMember({ onEnrolled }: { onEnrolled: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [field, setField] = useState(DEPARTMENTS[0]);
  const [title, setTitle] = useState(TEACHER_TITLES[2]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleDepartment = (department: string) => {
    setDepartments((current) =>
      current.includes(department) ? current.filter((item) => item !== department) : [...current, department]
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await registerAccount({
        name,
        username,
        password,
        role,
        field,
        title,
        departments,
        createdBy: "Registrar's Office"
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${result.account.name} can now sign in as @${result.account.username}.`);
      setName("");
      setUsername("");
      setPassword("");
      setDepartments([]);
      onEnrolled();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="enroll">
      <summary>Enroll a member without self-registration</summary>
      <form className="enroll-body" onSubmit={submit}>
        <div className="form-grid-2">
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              name="member-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sofia Ramirez"
              required
            />
          </label>
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              name="member-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="sofia.ramirez"
              pattern="[A-Za-z0-9._-]{3,24}"
              required
            />
          </label>
        </div>

        <div className="form-grid-2">
          <label className="field">
            <span>Temporary password</span>
            <input
              type="password"
              name="member-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8+ characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select name="member-role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {(["student", "teacher", "admin"] as const).map((item) => (
                <option key={item} value={item}>
                  {ROLE_INFO[item].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {role === "student" && (
          <label className="field">
            <span>Field of study</span>
            <select name="member-field" value={field} onChange={(event) => setField(event.target.value)}>
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
        )}

        {role === "teacher" && (
          <>
            <label className="field">
              <span>Academic title</span>
              <select name="member-title" value={title} onChange={(event) => setTitle(event.target.value)}>
                {TEACHER_TITLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Departments taught</span>
              <div className="dept-grid">
                {DEPARTMENTS.map((department) => {
                  const selected = departments.includes(department);
                  return (
                    <label key={department} className={`dept-chip${selected ? " is-on" : ""}`}>
                      <input type="checkbox" checked={selected} onChange={() => toggleDepartment(department)} />
                      {department}
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-ok">{notice}</div>}

        <button type="submit" className="btn btn-ghost" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </details>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}