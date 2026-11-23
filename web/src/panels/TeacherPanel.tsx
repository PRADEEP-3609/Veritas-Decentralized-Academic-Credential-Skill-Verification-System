import { useEffect, useState } from "react";
import { verifyPresentation, type VerificationReport } from "@shared/verify";
import type { VerifiableCredential } from "@shared/types";
import { deployment, provider, type CredentialBundle } from "../config";
import type { Account } from "../lib/roles";
import type { WalletMap } from "../lib/walletStore";
import { AccessList, CopyButton, Hash, RolePill, Spinner } from "../ui";

interface Props {
  teacher: Account;
  students: Account[];
  wallet: WalletMap;
  presentation: VerifiableCredential | null;
  sample: CredentialBundle | null;
  onVerified: (totalMs: number) => void;
}

const PENDING_CHECKS = [
  "Credential structure & schema",
  "did:ethr holder binding",
  "Issuer authorization",
  "ECDSA batch attestation",
  "Credential commitment",
  "Merkle inclusion proof",
  "On-chain anchor"
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export default function TeacherPanel({ teacher, students, wallet, presentation, sample, onVerified }: Props) {
  const [jsonText, setJsonText] = useState("");
  const [tamper, setTamper] = useState(false);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const departments = teacher.departments ?? [];
  const departmentStudents = students.filter((student) => departments.includes(student.field ?? ""));

  useEffect(() => {
    if (presentation) {
      setJsonText(JSON.stringify(presentation, null, 2));
      setReport(null);
      setTamper(false);
    }
  }, [presentation]);

  useEffect(() => {
    if (!presentation && sample?.vcs[0]) {
      setJsonText((current) => current || JSON.stringify(sample.vcs[0], null, 2));
    }
  }, [presentation, sample]);

  const verify = async () => {
    if (busy) return;
    setError(null);
    setReport(null);

    let parsed: VerifiableCredential;
    try {
      parsed = JSON.parse(jsonText) as VerifiableCredential;
    } catch (caught) {
      setError(caught instanceof Error ? `Invalid JSON: ${caught.message}` : "Invalid JSON");
      return;
    }

    const candidate: VerifiableCredential = tamper
      ? {
          ...parsed,
          credential: { ...parsed.credential, degreeType: "Ph.D.", fieldOfStudy: "Quantum Ethics" }
        }
      : parsed;

    setBusy(true);
    try {
      const result = await verifyPresentation(candidate, {
        provider,
        credentialRegistry: deployment.contracts.credentialRegistry.address,
        universityRegistry: deployment.contracts.universityRegistry.address
      });
      setReport(result);
      onVerified(result.totalMs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="work-grid employer-grid">
      <section className="card">
        <div className="card-head">
          <div>
            <span className="kicker">Faculty workspace</span>
            <h2>Check a presented credential</h2>
          </div>
          <span className="pill pill-soft">Read-only · no gas</span>
        </div>

        <label className="field">
          <span>Verifiable credential JSON</span>
          <textarea
            className="json-input"
            value={jsonText}
            onChange={(event) => {
              setJsonText(event.target.value);
              setReport(null);
            }}
            spellCheck={false}
            placeholder="Paste a credential a student presented for an internship or admission…"
          />
        </label>

        <div className="input-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => presentation && setJsonText(JSON.stringify(presentation, null, 2))}
            disabled={!presentation}
          >
            Last presentation
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => sample?.vcs[0] && setJsonText(JSON.stringify(sample.vcs[0], null, 2))}
            disabled={!sample?.vcs[0]}
          >
            Sample credential
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setJsonText("");
              setReport(null);
              setError(null);
            }}
            disabled={!jsonText}
          >
            Clear
          </button>
        </div>

        <label className="switch">
          <input type="checkbox" checked={tamper} onChange={(event) => setTamper(event.target.checked)} />
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
          <span className="switch-label">
            Simulate forgery
            <small>Rewrites the degree to “Ph.D.” before verifying</small>
          </span>
        </label>

        {error && <div className="alert alert-error">{error}</div>}

        <button type="button" className="btn btn-primary btn-block" onClick={verify} disabled={busy || !jsonText.trim()}>
          {busy ? (
            <>
              <Spinner /> Running 7 checks…
            </>
          ) : (
            "Verify credential"
          )}
        </button>
        <p className="hint">
          Faculty can verify a presentation but cannot issue, edit or delete a credential. Those actions belong to the
          administrator workspace.
        </p>
      </section>

      <div className="stack">
        <section className="card access-card">
          <div className="card-head compact">
            <div>
              <span className="kicker">Access control</span>
              <h2>{teacher.name}</h2>
            </div>
            <RolePill role="teacher" />
          </div>
          <AccessList role="teacher" />
          <p className="hint">
            {departments.length > 0
              ? `Scope: students enrolled in ${departments.join(" and ")}.`
              : "No department is assigned to this account."}
          </p>
        </section>

        <section className="card">
          <div className="card-head compact">
            <div>
              <span className="kicker">Department roster</span>
              <h2>Students on record</h2>
            </div>
            <span className="pill pill-soft">{departmentStudents.length} students</span>
          </div>
          {departmentStudents.length > 0 ? (
            <ul className="wallet-rows">
              {departmentStudents.map((student) => {
                const count = wallet[student.address.toLowerCase()]?.length ?? 0;
                return (
                  <li key={student.address} className="roster-static">
                    <span className="avatar">{initials(student.name)}</span>
                    <span className="wallet-meta">
                      <strong>{student.name}</strong>
                      <span className="muted small">{student.field}</span>
                    </span>
                    <span className="count-badge" aria-label={`${count} credentials`}>
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted small">No students are enrolled in the assigned departments.</p>
          )}
          <p className="hint">Read-only view. Faculty see only their own departments, never the full institution.</p>
        </section>

        {report ? (
          <>
            <section className={`verdict ${report.ok ? "is-ok" : "is-bad"}`}>
              <div className="verdict-copy">
                <span className="verdict-mark">{report.ok ? "✓" : "✕"}</span>
                <div>
                  <strong>{report.ok ? "Authentic credential" : "Verification failed"}</strong>
                  <span>
                    {report.ok
                      ? `${report.issuerName ?? "Registered issuer"} · batch #${report.batch?.id ?? "—"}`
                      : "At least one trust check failed — do not accept this credential"}
                  </span>
                </div>
              </div>
              <div className="verdict-time">
                <strong>{report.totalMs.toFixed(1)}</strong>
                <span>ms total</span>
              </div>
            </section>

            <section className="card">
              <span className="kicker">Trust checks</span>
              <ol className="steps">
                {report.steps.map((step) => (
                  <li key={step.id} className={`step ${step.ok ? "is-ok" : "is-bad"}`}>
                    <span className="step-icon">{step.ok ? "✓" : "✕"}</span>
                    <div className="step-body">
                      <strong>{step.title}</strong>
                      <span>{step.detail}</span>
                    </div>
                    <span className="step-ms">{step.ms.toFixed(2)} ms</span>
                  </li>
                ))}
              </ol>
            </section>

            {report.batch && (
              <section className="card evidence">
                <span className="kicker">On-chain evidence</span>
                <dl className="kv-list">
                  <div>
                    <dt>Batch root</dt>
                    <dd>
                      <Hash value={report.batch.merkleRoot} head={14} tail={10} />{" "}
                      <CopyButton value={report.batch.merkleRoot} />
                    </dd>
                  </div>
                  <div>
                    <dt>Cohort</dt>
                    <dd>
                      {report.batch.credentialCount} credentials · {report.batch.degreeType} ·{" "}
                      {report.batch.graduationYear}
                    </dd>
                  </div>
                  <div>
                    <dt>Anchored</dt>
                    <dd>{new Date(report.batch.issuedAt * 1000).toLocaleString()}</dd>
                  </div>
                </dl>
              </section>
            )}
          </>
        ) : (
          <section className="card pending-card">
            <span className="kicker">Pipeline</span>
            <h2>Seven checks, one verdict</h2>
            <p className="muted">
              Each presentation is validated locally and against the credential registry. The run usually completes in
              well under a second.
            </p>
            <ol className="steps is-pending">
              {PENDING_CHECKS.map((check) => (
                <li key={check} className="step">
                  <span className="step-icon" />
                  <div className="step-body">
                    <strong>{check}</strong>
                  </div>
                  <span className="step-ms">—</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
