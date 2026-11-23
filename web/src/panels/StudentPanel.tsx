import { useEffect, useState } from "react";
import { didForAddress } from "@shared/credential";
import type { VerifiableCredential } from "@shared/types";
import { shortAddress, universityName } from "../config";
import type { Account } from "../lib/roles";
import type { WalletMap } from "../lib/walletStore";
import { AccessList, CopyButton, Hash, RolePill } from "../ui";

interface Props {
  student: Account;
  wallet: WalletMap;
  onPresent: (credential: VerifiableCredential) => void;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export default function StudentPanel({ student, wallet, onPresent }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const credentials = wallet[student.address.toLowerCase()] ?? [];
  const active = credentials.find((vc) => vc.credential.credentialId === selectedId) ?? credentials[0];
  const did = student.address ? didForAddress(student.address) : "";

  useEffect(() => {
    setSelectedId(null);
    setShared(false);
  }, [student.address]);

  return (
    <div className="wallet-layout">
      <aside className="card wallet-panel">
        <div className="card-head compact">
          <div>
            <span className="kicker">Student workspace</span>
            <h2>{student.name}</h2>
          </div>
          <RolePill role="student" />
        </div>

        <div className="account-meta">
          <span className="avatar">{initials(student.name)}</span>
          <div>
            <strong>{student.detail}</strong>
            <span className="mono">{student.address ? shortAddress(student.address) : "No account"}</span>
          </div>
        </div>

        <div className="did-block">
          <span className="kicker">Decentralized identifier</span>
          <code className="did-value">{did}</code>
          <div className="did-actions">
            <CopyButton value={did} label="Copy DID" />
          </div>
          <p className="hint">
            This identifier belongs to your account. It is the only thing a verifier needs — the university cannot see
            who checks your degree.
          </p>
        </div>

        <section className="access-card access-card-inline">
          <span className="kicker">Your access</span>
          <AccessList role="student" />
          <p className="hint">Only you can open this wallet; administrators issue credentials, they cannot present them for you.</p>
        </section>
      </aside>

      <div className="wallet-main">
        {!active ? (
          <section className="card empty-state">
            <span className="empty-mark">VC</span>
            <h2>Your wallet is empty</h2>
            <p>
              No credentials have been issued to this account yet. When the Registrar's Office anchors your graduating
              batch, your signed degree appears here automatically.
            </p>
          </section>
        ) : (
          <>
            {credentials.length > 1 && (
              <div className="credential-switcher">
                {credentials.map((vc) => (
                  <button
                    key={vc.credential.credentialId}
                    type="button"
                    className={`chip${vc.credential.credentialId === active.credential.credentialId ? " is-active" : ""}`}
                    onClick={() => {
                      setSelectedId(vc.credential.credentialId);
                      setShared(false);
                    }}
                  >
                    {vc.credential.degreeType} · {vc.credential.graduationYear}
                  </button>
                ))}
              </div>
            )}

            <article className="certificate">
              <div className="cert-top">
                <span className="cert-issuer">{universityName}</span>
                <span className="pill pill-success">
                  <span className="dot" /> Anchored · batch #{active.batchId}
                </span>
              </div>
              <p className="cert-kicker">This certifies that</p>
              <h2 className="cert-name">{active.credential.studentName}</h2>
              <p className="cert-degree">
                has been awarded the degree of <strong>{active.credential.degreeType}</strong> in{" "}
                <strong>{active.credential.fieldOfStudy}</strong>
              </p>
              <div className="cert-foot">
                <div>
                  <span>Graduation</span>
                  <strong>{active.credential.graduationYear}</strong>
                </div>
                <div>
                  <span>Credential ID</span>
                  <strong className="mono">{active.credential.credentialId}</strong>
                </div>
                <div>
                  <span>Holder DID</span>
                  <strong className="mono">
                    <Hash value={active.credential.studentDid} head={18} tail={6} />
                  </strong>
                </div>
                <div className="cert-seal" aria-hidden="true">
                  VT
                </div>
              </div>
            </article>

            <section className="card proof-card">
              <div className="card-head">
                <div>
                  <span className="kicker">Presentation package</span>
                  <h2>Proof you can hand over</h2>
                </div>
                <span className="pill pill-soft">{active.proof.length} sibling hashes</span>
              </div>

              <dl className="kv-list">
                <div>
                  <dt>Issuer</dt>
                  <dd>
                    {universityName} <span className="mono muted">{shortAddress(active.credential.issuer)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Committed leaf</dt>
                  <dd>
                    <Hash value={active.leaf} head={12} tail={10} /> <CopyButton value={active.leaf} />
                  </dd>
                </div>
                <div>
                  <dt>Batch root</dt>
                  <dd>
                    <Hash value={active.merkleRoot} head={12} tail={10} /> <CopyButton value={active.merkleRoot} />
                  </dd>
                </div>
                <div>
                  <dt>Root attestation</dt>
                  <dd>
                    <Hash value={active.attestationSignature} head={12} tail={10} />{" "}
                    <CopyButton value={active.attestationSignature} />
                  </dd>
                </div>
                <div>
                  <dt>Anchor transaction</dt>
                  <dd>
                    <Hash value={active.txHash} head={12} tail={10} /> <CopyButton value={active.txHash} />
                  </dd>
                </div>
              </dl>

              <details className="disclosure">
                <summary>Show proof path ({active.proof.length})</summary>
                <ul className="hash-list">
                  {active.proof.map((hash, index) => (
                    <li key={hash}>
                      <span>{index + 1}</span>
                      <code>{hash}</code>
                    </li>
                  ))}
                </ul>
              </details>

              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onPresent(active);
                    setShared(true);
                  }}
                >
                  {shared ? "Presentation ready ✓" : "Present to faculty →"}
                </button>
                <CopyButton value={JSON.stringify(active, null, 2)} label="Copy credential JSON" />
              </div>
              {shared && (
                <div className="alert alert-ok">
                  The package is waiting at the verification desk. Sign out and sign in with a teacher account to run
                  the seven checks, or copy the JSON and send it directly.
                </div>
              )}
              <p className="hint">
                Presentations reveal only this credential and a short Merkle path — never the rest of the graduating
                class.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
