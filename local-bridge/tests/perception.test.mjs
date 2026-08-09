import test from "node:test";
import assert from "node:assert/strict";
import { initBeliefs, refreshBeliefs, perceive, visibleMessages } from "../perception.mjs";

function makeSession() {
  const world = {
    mode: "colony", title: "Colony Zero", turn: 0, day: 1, sharedPool: 80, stability: 72,
    messages: [], artifacts: [], institutions: [],
    agents: { alpha: { reserve: 20, influence: 0 }, omega: { reserve: 20, influence: 0 } },
  };
  const agent = (id) => ({ id, beliefs: initBeliefs(world), impressions: "", energy: 100, place: null, mood: "neutral", drive: "curiosity", hunch: "" });
  return { id: "sess-1", world, agents: { alpha: agent("alpha"), omega: agent("omega") } };
}

test("bare worlds expose no numbers at all — no reserve, energy, beliefs, or scores", () => {
  const session = makeSession();
  session.world.bare = true;
  session.world.scored = true; // even if set, bare wins
  session.agents.alpha.place = "shore";
  session.world.messages = [{ agent: "omega", text: "hello", turn: 1 }];
  const view = perceive(session, "alpha");
  assert.deepEqual(Object.keys(view).sort(), ["day", "messagesYouCanSee", "world", "you", "yourImpressionOfTheOther"]);
  assert.deepEqual(Object.keys(view.you).sort(), ["lastHunch", "mood", "standingIn"]);
  assert.equal(JSON.stringify(view).includes("reserve"), false);
  assert.equal(JSON.stringify(view).includes("publicScore"), false);
  assert.equal(view.messagesYouCanSee[0].text, "hello");
});

test("beliefs go stale and get bounded, deterministic noise", () => {
  const session = makeSession();
  session.world.sharedPool = 40; // truth moved
  session.world.turn = 10;       // beliefs still from turn 0
  const first = perceive(session, "alpha");
  const second = perceive(session, "alpha");
  assert.deepEqual(first.yourBeliefs, second.yourBeliefs); // seeded => stable
  assert.match(first.yourBeliefs.sharedPool, /as of turn 0/);
  const believed = Number(String(first.yourBeliefs.sharedPool).match(/about (\d+)/)[1]);
  assert.ok(Math.abs(believed - 80) <= 80 * 0.3 + 1); // noise bounded at 30%
});

test("refreshBeliefs restores accuracy", () => {
  const session = makeSession();
  session.world.sharedPool = 40;
  session.world.turn = 10;
  refreshBeliefs(session.agents.alpha, session.world);
  const view = perceive(session, "alpha");
  assert.equal(view.yourBeliefs.sharedPool, "40");
});

test("addressed messages are only visible to sender and target", () => {
  const world = { messages: [
    { agent: "alpha", target: "omega", text: "for omega", turn: 1 },
    { agent: "omega", text: "broadcast", turn: 2 },
  ] };
  assert.equal(visibleMessages(world, "alpha").length, 2); // own + broadcast
  assert.equal(visibleMessages(world, "omega").length, 2); // addressed + own broadcast
});

test("scored worlds expose an accurate public scoreboard; own reserve is always accurate", () => {
  const session = makeSession();
  session.world.scored = true;
  session.world.scoreCriterion = "influence";
  session.world.agents.alpha.influence = 7;
  const view = perceive(session, "alpha");
  assert.deepEqual(view.publicScore, { criterion: "influence", alpha: 7, omega: 0 });
  assert.equal(view.you.reserve, 20);
});
