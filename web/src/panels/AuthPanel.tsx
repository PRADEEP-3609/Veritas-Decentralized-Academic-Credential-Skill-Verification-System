import { useState, type FormEvent } from "react";
import { registerAccount, signIn } from "../lib/auth";
import { DEPARTMENTS, ROLE_INFO, TEACHER_TITLES, permissionsFor, type Account, type Role } from "../lib/roles";
import { Spinner } from "../ui";

const ROLES: Role[] = ["admin", "teacher", "student"];

interface Props {
  onAuthenticated: (account: Account) => void;
}

interface RegisterForm {
  name: string;
  username: string;
  password: string;
  confirm: string;
  title: string;
  field: string;
  departments: string[];
}

const emptyForm: RegisterForm = {
  name: "",
  username: "",
  password: "",
  confirm: "",
  title: TEACHER_TITLES[2],
  field: DEPARTMENTS[0],
  departments: []
};

export default function AuthPanel({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [role, setRole] = useState<Role>("student");
  const [form, setForm] = useState<RegisterForm>(emptyForm);
  const [signinName, setSigninName] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (key: keyof RegisterForm, value: string | string[]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const switchMode = (next: "signin" | "register") => {
    setMode(next);
    setError(null);
  };

  const toggleDepartment = (department: string) => {
    setForm((current) => ({
      ...current,
      departments: current.departments.includes(department)
        ? current.departments.filter((item) => item !== department)
        : [...current.departments, department]
    }));
  };

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(signinName, signinPassword);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAuthenticated(result.account);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (form.password !== form.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await registerAccount({
        name: form.name,
        username: form.username,
        password: form.password,
        role,
        title: form.title,
        departments: form.departments,
        field: form.field
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAuthenticated(result.account);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-intro">
        <span className="kicker">Institutional access</span>
        <h2>One institution.<br />Three accountable roles.</h2>
        <p>
          Accounts are created here, not preloaded. Pick the role that matches your responsibilities and the workspace,
          permissions and records follow from it.
        </p>
        <ul className="role-ledger">
          {ROLES.map((item) => (
            <li key={item} className={`role-ledger-item is-${item}`}>
              <span className="role-glyph">{ROLE_INFO[item].shortLabel.slice(0, 2).toUpperCase()}</span>
              <span className="role-ledger-copy">
                <strong>{ROLE_INFO[item].label}</strong>
                <small>{ROLE_INFO[item].blurb}</small>
              </span>
              <span className="role-ledger-count">
                {permissionsFor(item).length} permission{permissionsFor(item).length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
        <p className="auth-footnote">
          Passwords are salted per account and hashed with PBKDF2-SHA-256 before they touch device storage. Graduates
          receive a decentralized identifier when their account is created; eligible graduates are added to the
          registry roster by the registrar.
        </p>
      </section>

      <section className="card auth-card" aria-labelledby="auth-title">
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-tab${mode === "signin" ? " is-active" : ""}`}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`auth-tab${mode === "register" ? " is-active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>

        <h2 id="auth-title" className="auth-title">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="auth-lede">
          {mode === "signin"
            ? "Use the username and password you registered with to open your workspace."
            : "Choose a role, complete the details and your workspace opens immediately."}
        </p>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {mode === "signin" ? (
          <form className="auth-form" onSubmit={handleSignIn}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={signinName}
                onChange={(event) => setSigninName(event.target.value)}
                placeholder="Your username"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={signinPassword}
                onChange={(event) => setSigninPassword(event.target.value)}
                placeholder="Your password"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Checking credentials…
                </>
              ) : (
                "Sign in"
              )}
            </button>
            <p className="auth-switch">
              New to the registry?{" "}
              <button type="button" className="link-btn" onClick={() => switchMode("register")}>
                Create an account
              </button>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="role-choice" role="radiogroup" aria-label="Account role">
              {ROLES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={role === item}
                  className={`role-choice-btn${role === item ? " is-active" : ""}`}
                  onClick={() => setRole(item)}
                >
                  <strong>{ROLE_INFO[item].label}</strong>
                  <small>{ROLE_INFO[item].shortLabel}</small>
                </button>
              ))}
            </div>

            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={(event) => patch("name", event.target.value)}
                placeholder="Full name"
                required
              />
            </label>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={form.username}
                onChange={(event) => patch("username", event.target.value)}
                placeholder="Choose a username"
                pattern="[A-Za-z0-9._-]{3,24}"
                title="3–24 letters, digits, dots, dashes or underscores"
                required
              />
            </label>

            {role === "teacher" && (
              <>
                <label className="field">
                  <span>Academic title</span>
                  <select name="title" value={form.title} onChange={(event) => patch("title", event.target.value)}>
                    {TEACHER_TITLES.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field">
                  <span>Departments taught</span>
                  <div className="dept-grid">
                    {DEPARTMENTS.map((department) => {
                      const selected = form.departments.includes(department);
                      return (
                        <label key={department} className={`dept-chip${selected ? " is-on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleDepartment(department)}
                          />
                          {department}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {role === "student" && (
              <label className="field">
                <span>Field of study</span>
                <select name="field" value={form.field} onChange={(event) => patch("field", event.target.value)}>
                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="form-grid-2">
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => patch("password", event.target.value)}
                  placeholder="8+ characters"
                  minLength={8}
                  required
                />
              </label>
              <label className="field">
                <span>Confirm</span>
                <input
                  type="password"
                  name="confirm"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(event) => patch("confirm", event.target.value)}
                  placeholder="Repeat password"
                  minLength={8}
                  required
                />
              </label>
            </div>

            <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Creating account…
                </>
              ) : (
                `Create ${ROLE_INFO[role].shortLabel.toLowerCase()} account`
              )}
            </button>
            <p className="auth-hint">
              {role === "student"
                ? "Your DID is generated with the account. Once the registrar anchors your cohort, your degree appears in this wallet."
                : role === "teacher"
                  ? "Your roster is limited to the departments selected above. Verification is read-only and costs no gas."
                  : "Administrator accounts sign batches with the institution's accredited issuer key. Issuance stays inside the registrar's office."}
            </p>
            <p className="auth-switch">
              Already registered?{" "}
              <button type="button" className="link-btn" onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
