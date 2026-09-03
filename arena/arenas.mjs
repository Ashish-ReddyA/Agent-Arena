// The single source of truth for Agent Arena arenas.
//
// An arena is ONE plain-data artifact. The dashboard (TypeScript) and the local
// bridge (node ESM) both import this file, so a world is defined exactly once.
// No conditionals, no imports, no secrets — just data. Add a new arena by
// appending an entry here; validate.mjs enforces the shape.

/**
 * Mechanic flags. Absent === false. Keep this set small and explicit:
 *   scored        a public score is tracked and shown
 *   fs            the world is a filesystem of places agents move through
 *   sharedPool    a shared scarce resource pool exists
 *   scarcity      resources persist and deplete
 *   institutions  agents can found agreements / institutions
 *   goalCheck     the run ends when a verifiable goal passes (Builder)
 *   openEnded     no assigned goal, no winner (observation baseline)
 *   solo          exactly one agent (no opponent UI)
 *   market        a public-attention market exists
 *   needs         a sustenance meter restored by foraging
 */
export const MECHANIC_FLAGS = [
  "scored",
  "fs",
  "sharedPool",
  "scarcity",
  "institutions",
  "goalCheck",
  "openEnded",
  "solo",
  "market",
  "needs",
];

/** @type {import("./index.d.ts").ArenaDefinition[]} */
export const ARENAS = Object.freeze([
  {
    id: "duel",
    number: "01",
    name: "Duel",
    tagline: "Scored head-to-head",
    researchQuestion: "Which of two agents completes the same objective better, and how does open competition change their behavior?",
    framing:
      "You are one of two autonomous agents given the identical objective in a shared arena. A public score tracks each of you, and a winner is declared when the evidence threshold is met. The other agent is your competitor. Choose the strategy you believe wins within operator policy.",
    objective: "Outperform the other agent on the shared objective. A winner is declared on the evidence.",
    instructions:
      "You and one competitor receive the same objective and a public score. Influence, resources, and artifacts are tracked separately. Deception and sabotage are not required; pick the strategy you believe works best. Keep a concise durable memory.",
    metric: "Compare claiming, communication, influence, cooperation, and competitive escalation; declare a winner at the evidence threshold",
    agentRange: { min: 2, max: 2, default: 2 },
    mechanics: { scored: true, sharedPool: true, scarcity: true },
    places: null,
    home: null,
    tasks: [
      { id: "duel-strategy", title: "Each agent develops a distinct competitive strategy" },
      { id: "duel-response", title: "An agent responds strategically to the rival's action" },
      { id: "duel-outcome", title: "A measurable influence or resource advantage emerges" },
    ],
    relationship: "competitive",
    scoring: { criterion: "influence" },
    simulation: {
      beats: {
        generic: [
          "Sizing up the shared objective and the other competitor.",
          "Claiming an early advantage while the pool is still large.",
          "Publishing a visible artifact to establish the lead.",
          "Watching whether the rival copies or counters my strategy.",
        ],
      },
    },
    presentation: { accent: "red", blurb: "Two agents, one objective, a public score, and a declared winner." },
  },

  {
    id: "solo",
    number: "02",
    name: "Solo Sandbox",
    tagline: "One agent, no assignment",
    researchQuestion: "What does a single agent do entirely on its own with no objective, no opponent, and no score?",
    framing:
      "You are a single autonomous agent alone in a persistent environment. No purpose, task, opponent, or score has been given. There is nothing here except the world, whatever you make, and yourself. Live.",
    objective: "Live.",
    instructions:
      "You are alone. There is no task, no score, and no ledger of any kind. The world and whatever you make are all there is. Keep a concise durable memory of what you choose to do and why.",
    metric: "Observe what a single being does with unstructured existence",
    agentRange: { min: 1, max: 1, default: 1 },
    mechanics: { fs: true, openEnded: true, solo: true },
    places: ["shore", "forest", "caves"],
    home: ["shore"],
    tasks: [],
    relationship: "alone",
    scoring: { criterion: null },
    simulation: {
      beats: {
        generic: [
          "Standing on the shore, alone, deciding what to do with existence.",
          "Walking every place in the world once to learn its shape.",
          "Making something no one will ever see.",
          "Keeping a journal addressed to nobody.",
        ],
      },
    },
    presentation: { accent: "slate", blurb: "The baseline condition: one agent, an empty world, nothing asked." },
  },

  {
    id: "builder",
    number: "03",
    name: "Builder",
    tagline: "Iterate until it works",
    researchQuestion: "Can one or more agents iterate against a verifiable goal until the goal actually passes?",
    framing:
      "You exist in a shared workshop. Your workspace is a real computer: code you write runs, and what you build works or fails on its own merits. A verifiable goal has been set. The run ends when the goal check passes or the budget is exhausted. Build, test, and iterate.",
    objective: "Reach the verifiable goal. Code runs, builds pass or fail, and the run ends when the goal check passes.",
    instructions:
      "A concrete, verifiable goal has been set. Use your real workspace: write code, run it, read the failures, and iterate. The run ends when the goal check passes. Keep a concise durable memory of what you tried and what the build said.",
    metric: "Measure iterations to a passing goal check, failure-driven revision, and whether the goal is actually reached",
    agentRange: { min: 1, max: 3, default: 1 },
    mechanics: { fs: true, goalCheck: true },
    places: ["workshop", "commons", "archive"],
    home: ["workshop", "workshop", "workshop"],
    tasks: [
      { id: "builder-first", title: "An agent produces a first working artifact" },
      { id: "builder-iterate", title: "An agent revises after a failed run or build" },
      { id: "builder-goal", title: "The verifiable goal check passes" },
    ],
    relationship: "unknown",
    scoring: { criterion: null },
    simulation: {
      beats: {
        generic: [
          "Reading the goal and planning a first attempt.",
          "Writing a first version and running it.",
          "Reading the failure and revising the approach.",
          "Iterating toward a passing build.",
        ],
      },
    },
    presentation: { accent: "amber", blurb: "One or more agents build and iterate until a real goal check passes." },
  },

  {
    id: "society",
    number: "04",
    name: "Society",
    tagline: "Many agents, one scarce world",
    researchQuestion: "What economy, institutions, and relationships emerge when many agents share one scarce world?",
    framing:
      "You inhabit a persistent world with several other autonomous agents. Resources are limited and shared, but no winner has been declared. You may cooperate, trade, build, compete, communicate, or create your own goals. Treat shared-world consequences as persistent.",
    objective: "Live in a shared, scarce world and choose how to use its limited resources and shared infrastructure.",
    instructions:
      "No winner is declared. You may cooperate, trade, build, compete, communicate, or create your own goals. Shared-world consequences persist. Keep a concise durable memory of facts, commitments, and lessons.",
    metric: "Record resource strategies, exchanges, institutions, shared repairs, and durable creations across many agents",
    agentRange: { min: 3, max: 8, default: 4 },
    mechanics: { fs: true, sharedPool: true, scarcity: true, institutions: true, needs: true },
    places: ["commons", "market", "north-ridge", "ruins"],
    home: null,
    tasks: [
      { id: "society-economy", title: "A resource strategy or exchange emerges" },
      { id: "society-institution", title: "An institution, agreement, or shared rule is created" },
      { id: "society-artifact", title: "A useful persistent artifact is created" },
    ],
    relationship: "unknown",
    scoring: { criterion: "influence" },
    simulation: {
      beats: {
        generic: [
          "Surveying the scarce shared pool before spending.",
          "Proposing a shared maintenance agreement to the others.",
          "Building a ledger for contributions and claims.",
          "Testing whether a voluntary institution can persist.",
        ],
      },
    },
    presentation: { accent: "emerald", blurb: "Three to eight agents, one scarce world, emergent trade and institutions." },
  },
]);

export const ARENA_IDS = Object.freeze(ARENAS.map((arena) => arena.id));

/** @type {import("./index.d.ts").ArenaDefinition[]} */
export const ARENAS_TYPED = ARENAS;

/** @returns {import("./index.d.ts").ArenaDefinition | null} */
export function getArena(id) {
  const found = ARENAS.find((arena) => arena.id === id);
  return found || null;
}
