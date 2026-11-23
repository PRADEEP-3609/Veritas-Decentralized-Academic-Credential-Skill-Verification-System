// Capture application screenshots for the report using the Chrome DevTools Protocol.
// The script drives the real account-creation flow: one registrar, one teacher and
// five graduate accounts, then issues a batch and verifies a presented credential.
// Usage: node capture_ui.mjs (Chrome must listen on 127.0.0.1:9333, app on 5173)
import fs from "node:fs";
import path from "node:path";

const DEBUG = "http://127.0.0.1:9333";
const APP = "http://localhost:5173";
const OUT = path.resolve(process.cwd());
const PASSWORD = "Veritas#2026";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await fetch(`${DEBUG}/json`).then((response) => response.json());
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("No page target found");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const errors = [];

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(message.params).slice(0, 400));
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" ").slice(0, 400));
  }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
});

await new Promise((resolve) => ws.addEventListener("open", resolve));

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text + " " + (result.exceptionDetails.exception?.description ?? ""));
  }
  return result.result.value;
}

async function waitFor(expression, timeout = 30000, label = expression) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression).catch(() => false)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function setInput(selector, value) {
  const ok = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Input not found: ${selector}`);
}

async function click(selector, text) {
  const ok = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) =>
      item.textContent.includes(${JSON.stringify(text)})
    );
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Clickable not found: ${selector} / ${text}`);
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, "base64"));
  console.log("saved", name);
}

const ROLE_LABEL = { admin: "Administrator", teacher: "Teacher", student: "Student" };

async function signOut() {
  await click(".whoami button", "Sign out");
  await waitFor(`!!document.querySelector(".auth-card")`, 10000, "auth screen after sign out");
}

async function register(role, { name, username, field, title, departments }) {
  await click(".auth-tab", "Create account");
  await waitFor(`!!document.querySelector('input[name="name"]')`);
  await click(".role-choice-btn", ROLE_LABEL[role]);
  await setInput('input[name="name"]', name);
  await setInput('input[name="username"]', username);
  if (role === "teacher") {
    await setInput('select[name="title"]', title);
    for (const department of departments) await click(".dept-chip", department);
  }
  if (role === "student") await setInput('select[name="field"]', field);
  await setInput('input[name="password"]', PASSWORD);
  await setInput('input[name="confirm"]', PASSWORD);
  await sleep(120);
  await evaluate(`document.querySelector(".auth-form button[type='submit']").click()`);
  await waitFor(`!document.querySelector(".auth-card")`, 20000, `workspace after registering ${name}`);
  await sleep(250);
}

async function signIn(username) {
  await waitFor(`!!document.querySelector('input[name="username"]')`);
  await setInput('input[name="username"]', username);
  await setInput('input[name="password"]', PASSWORD);
  await sleep(80);
  await evaluate(`document.querySelector(".auth-form button[type='submit']").click()`);
  await waitFor(`!document.querySelector(".auth-card")`, 20000, `workspace after signing in ${username}`);
  await sleep(300);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1200,
  deviceScaleFactor: 1.5,
  mobile: false
});

await send("Page.navigate", { url: APP });
await sleep(1500);
await evaluate(`localStorage.clear(); location.reload(); true`);
await waitFor(`!!document.querySelector(".auth-card")`, 20000);
await sleep(1200);

await register("admin", { name: "Ananya Rao", username: "registrar" });
await signOut();
await register("teacher", {
  name: "Dr. Kavya Rao",
  username: "kavya.rao",
  title: "Associate Professor",
  departments: ["Computer Science", "Data Science"]
});
await signOut();

const students = [
  { name: "Aarav Mehta", username: "aarav.mehta", field: "Computer Science" },
  { name: "Sofia Ramirez", username: "sofia.ramirez", field: "Data Science" },
  { name: "Liang Chen", username: "liang.chen", field: "Electrical Engineering" },
  { name: "Amara Okafor", username: "amara.okafor", field: "Information Systems" },
  { name: "Noah Fischer", username: "noah.fischer", field: "Mechanical Engineering" }
];
for (const student of students) {
  await register("student", student);
  await signOut();
}
console.log("accounts registered");

// Administrator workspace — run a full issuance and capture the working area.
await signIn("registrar");
await waitFor(`/issue a graduation batch/i.test(document.body.innerText)`);
await sleep(400);
await click("button", "Hash, sign");
await waitFor(`!!document.querySelector(".receipt")`, 90000, "batch receipt");
const batchLabel = await evaluate(`document.querySelector(".receipt h2")?.textContent ?? ""`);
console.log("batch:", batchLabel);
await evaluate(`document.querySelector(".work-grid").scrollIntoView({ block: "start" }); window.scrollBy(0, -90); true`);
await sleep(700);
await shot("fig-8-2-admin.png");

// Student workspace — the holder sees only their own DID, certificate and proof.
await signOut();
await signIn("aarav.mehta");
await waitFor(`/decentralized identifier/i.test(document.body.innerText)`);
await evaluate(`window.scrollTo(0, 0); true`);
await sleep(600);
await shot("fig-8-3-student.png");

// Presenting a credential hands it to the faculty desk.
await click("button", "Present to faculty");
await sleep(500);

// Faculty workspace — sign in as the teacher and verify the presented package.
await signOut();
await signIn("kavya.rao");
await waitFor(`document.querySelector(".json-input")?.value.includes("studentName")`, 10000, "presented credential");
await click("button", "Verify credential");
await waitFor(`/authentic credential/i.test(document.body.innerText)`, 40000, "authentic verdict");
const authenticMs = await evaluate(`document.querySelector(".verdict-time strong")?.textContent ?? ""`);
console.log("valid verification:", authenticMs, "ms");
await evaluate(`document.querySelector(".stack").scrollIntoView({ block: "start" }); window.scrollBy(0, -100); true`);
await sleep(600);
await shot("fig-8-4-teacher.png");

// A forged presentation must be rejected.
await evaluate(`document.querySelector(".switch input").click()`);
await click("button", "Verify credential");
await waitFor(`/verification failed/i.test(document.body.innerText)`, 40000, "forged verdict");
const forgedMs = await evaluate(`document.querySelector(".verdict-time strong")?.textContent ?? ""`);
console.log("forged verification:", forgedMs, "ms");
await evaluate(`document.querySelector(".stack").scrollIntoView({ block: "start" }); window.scrollBy(0, -100); true`);
await sleep(600);
await shot("fig-8-5-forgery.png");

if (errors.length > 0) console.log("console errors:", errors);
else console.log("no console errors");

ws.close();
console.log("done");
