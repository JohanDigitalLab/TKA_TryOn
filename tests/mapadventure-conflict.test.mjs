import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMapadventureClient, matchingSession, openGachaChest } from "../src/lib/student/mapadventure-client.js";

const user = "11111111-1111-4111-8111-111111111111";
const nodeId = "22222222-2222-4222-8222-222222222222";
const otherNode = "33333333-3333-4333-8333-333333333333";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const savedState = () => ({
  settings: { SHOW_TIPS: "0" }, subject_code: "MAT", islands: [{ id: "island", theme: "Bilangan" }],
  nodes: [{ id: nodeId, theme_id: "island", topic: "Pecahan" }, { id: otherNode, theme_id: "island", topic: "Desimal" }],
  sessions: [{ attempt_id: user, nodeId, stage: "sidequest", subject_code: "MAT", theme_id: "island", index: 2, answered: 1, total: 5 }],
  session: null,
});
const selected = (stage = "sidequest", node = nodeId) => ({ ...savedState(), session: {
  attempt_id: user, nodeId: node, stage, question: { id: otherNode }, index: 2, answered: 1, total: 5,
  tools: [], effects: {}, remaining_seconds: 50, deadline_at: "2026-11-25T04:00:00Z",
} });

function clientFixture(action) {
  let identity = user;
  let invalidations = 0;
  const calls = [];
  const client = createMapadventureClient({
    getSession: async () => ({ data: { session: { access_token: "token", user: { id: identity } } } }),
    fetcher: async () => ({ ok: true, json: async () => ({ userId: identity }) }),
    actions: new Proxy({}, { get: (_, name) => async payload => {
      calls.push([name, payload]);
      return action(name, payload, () => { identity = otherNode; });
    } }),
    onIdentityChange: () => { invalidations++; },
  });
  return { client, calls, invalidations: () => invalidations };
}
const ok = data => ({ ok: true, userId: user, data });

test("stage descriptor matching never substitutes another node or stage", () => {
  const data = savedState();
  assert.equal(matchingSession(data, { nodeId, stage: "sidequest" }).attempt_id, user);
  assert.equal(matchingSession(data, { nodeId, stage: "practice" }), null);
  assert.equal(matchingSession(data, { nodeId: otherNode, stage: "sidequest" }), null);
});

test("lost start discovers matching descriptor then bootstraps only that attempt", async () => {
  const data = savedState();
  data.sessions.unshift({ attempt_id: otherNode, nodeId, stage: "practice" });
  const f = clientFixture(async (action, payload) => {
    if (action === "start") throw Error("offline");
    return ok(payload.attempt_id ? selected() : data);
  });
  const result = await f.client("start", { nodeId, stage: "sidequest" });
  assert.equal(result.session.attempt_id, user);
  assert.deepEqual(f.calls, [["start", { nodeId, stage: "sidequest" }], ["bootstrap", {}], ["bootstrap", { attempt_id: user }]]);
});

test("lost start with only unrelated descriptors does not start or visit another session", async () => {
  const f = clientFixture(async action => {
    if (action === "start") throw Error("offline");
    return ok(savedState());
  });
  const data = await f.client("start", { nodeId, stage: "practice" });
  assert.equal(data.session, null);
  assert.deepEqual(f.calls.map(([action]) => action), ["start", "bootstrap"]);
});

test("uncertain navigation/tool/finish reconcile selected attempt without replay", async () => {
  for (const mutation of ["previous", "next", "use_tool", "complete_node"]) {
    let offline = true;
    const f = clientFixture(async action => {
      if (offline) throw Error("offline");
      assert.equal(action, "bootstrap");
      return ok(selected());
    });
    const payload = { attempt_id: user, question_id: otherNode };
    await assert.rejects(f.client(mutation, payload), /Koneksi terputus/);
    offline = false;
    await f.client(mutation, payload);
    assert.deepEqual(f.calls, [[mutation, payload], ["bootstrap", { attempt_id: user }], ["bootstrap", { attempt_id: user }]]);
  }
});

test("identity changes during targeted reconciliation invalidate old data", async () => {
  const f = clientFixture(async (action, payload, switchAccount) => {
    if (action === "answer") throw Error("offline");
    switchAccount();
    return ok(selected());
  });
  await assert.rejects(f.client("answer", { attempt_id: user, question_id: otherNode }), { code: "ACCOUNT_CHANGED" });
  assert.equal(f.invalidations(), 1);
});

// Execute the real hook with deterministic hooks; navigation logic is not copied.
function hookFixture() {
  const slots = [], effects = [], calls = [], memory = new Map();
  let cursor = 0, first = true, authChange, invalidateClient;
  let response = savedState();
  let requestImpl = async () => structuredClone(response);
  const useState = initial => {
    const index = cursor++;
    if (first) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const useRef = initial => { const index = cursor++; if (first) slots[index] = { current: initial }; return slots[index]; };
  const source = read("src/components/student/mapadventure/useMapAdventure.js").replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
  const actionNames = ["bootstrapMapadventure", "settingsMapadventure", "materialMapadventure", "readCompleteMapadventure", "startMapadventure", "answerMapadventure", "timeoutMapadventure", "nextMapadventure", "previousMapadventure", "useToolMapadventure", "buyMapadventure", "mapadventure_complete_node", "mapadventure_complete_island", "mapadventure_open_gatcha"];
  const dependencies = {
    useState, useRef, useCallback: fn => fn, useEffect: effect => { if (first) effects.push(effect); }, startTransition: fn => { void fn(); },
    setTimeout: () => 1, clearTimeout: () => {}, sessionStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) },
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: user } } } }), onAuthStateChange: fn => { authChange = fn; return { data: { subscription: { unsubscribe() {} } } }; } } },
    openGachaChest,
    createMapadventureClient: options => { invalidateClient = options.onIdentityChange; return async (action, payload, context) => { calls.push([action, payload, context]); await options.getSession(); return requestImpl(action, payload, context); }; },
    ...Object.fromEntries(actionNames.map(name => [name, () => {}])),
  };
  const evaluateHook = new Function(...Object.keys(dependencies), `${source}\nreturn useMapAdventure;`)(...Object.values(dependencies));
  const render = () => { cursor = 0; const game = evaluateHook(); if (first) { first = false; effects.forEach(effect => effect()); } return game; };
  render();
  return { render, calls, memory, response: value => { response = value; }, request: fn => { requestImpl = fn; }, signOut: () => authChange("SIGNED_OUT", null), invalidate: () => invalidateClient() };
}

test("bootstrap does not auto-select a session or open quiz; every stage click dispatches start", async () => {
  const f = hookFixture();
  await f.render().run("bootstrap");
  assert.equal(f.render().quizOpen, false);
  assert.equal(f.render().selection, null);
  for (const [node, stage] of [[nodeId, "sidequest"], [nodeId, "practice"], [otherNode, "gatekeeper"]]) {
    f.response(selected(stage, node));
    await f.render().run("start", { nodeId: node, stage });
    assert.equal(f.render().quizOpen, true);
    f.render().closeQuiz();
    assert.equal(f.render().quizOpen, false);
  }
  assert.deepEqual(f.calls.map(([action]) => action), ["bootstrap", "start", "start", "start"]);
});

test("only matching stage response opens quiz, including delayed reconciliation of another stage", async () => {
  const f = hookFixture();
  f.response(selected());
  await f.render().run("start", { nodeId, stage: "practice" });
  assert.equal(f.render().quizOpen, false);
});

test("subject switching restores per-user+subject navigation without auto-opening quiz", async () => {
  const f = hookFixture();
  await f.render().run("bootstrap");
  f.render().setSelection({ island: "island", node: otherNode });
  const english = { ...savedState(), subject_code: "ENG", nodes: [{ id: "reading", theme_id: "english" }], islands: [{ id: "english" }] };
  f.response(english);
  await f.render().run("settings", { settings: { SUBJECT: "Bahasa Inggris" } });
  assert.equal(f.render().selection, null);
  f.render().setSelection({ island: "english", node: "reading" });
  f.response(savedState());
  await f.render().run("settings", { settings: { SUBJECT: "Matematika" } });
  assert.deepEqual(f.render().selection, { island: "island", node: otherNode });
  assert.deepEqual(JSON.parse(f.memory.get(`mapadventure-view:${user}:ENG`)), { island: "english", node: "reading" });
  assert.equal(f.render().quizOpen, false);
});

test("account invalidation clears selected session and rejects stale in-flight stage response", async () => {
  const f = hookFixture();
  await f.render().run("bootstrap");
  let release;
  f.request(() => new Promise(resolve => { release = resolve; }));
  const pending = f.render().run("start", { nodeId, stage: "sidequest" });
  await new Promise(resolve => setImmediate(resolve));
  f.invalidate();
  release(selected());
  assert.equal(await pending, null);
  assert.equal(f.render().state, null);
  assert.equal(f.render().selection, null);
  assert.equal(f.render().quizOpen, false);
  f.signOut();
  assert.equal(f.render().state, null);
});
