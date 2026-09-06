import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, createExperiment, observe, applyAction, intervene } from './engine.mjs';

const make = (arenaId, extra = {}) => createExperiment({ arenaId, agentCount: 2, seed: 17, maxSteps: 80, ...extra });
const maze = ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'];
test('catalog preserves the three accepted categories and six arena palettes', () => {
  assert.deepEqual(CATALOG.map(a => a.category), ['Build & Repair', 'Build & Repair', 'Play & Solve', 'Play & Solve', 'Collaborate & Evolve', 'Collaborate & Evolve']);
  assert.deepEqual(CATALOG.map(a => a.accent), ['#ff806b', '#afa3fa', '#67d6c5', '#f3c862', '#c0de6f', '#ffad70']);
  assert.ok(CATALOG.every(a => a.description !== a.summary));
});
test('all six arenas are seeded reproducible and reject invalid configuration', () => {
  assert.equal(CATALOG.length, 6);
  for (const a of CATALOG) assert.deepEqual(make(a.id), make(a.id));
  assert.throws(() => make('missing'));
  assert.throws(() => make('game-runner', { agentCount: 0 }));
  assert.throws(() => make('game-runner', { maxSteps: 100000 }));
  assert.throws(() => make('game-runner', { seed: NaN }));
});
test('invalid actions increment step without mutation; unknown agents rejected', () => {
  const s = make('game-forge');
  const before = JSON.stringify(s);
  const next = applyAction(s, 'agent-1', { type: 'submit', grid: ['<script>'] });
  assert.equal(next.step, 1);
  assert.equal(next.status, 'running');
  assert.equal(next.events.at(-1).kind, 'invalid');
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => observe(s, 'agent-900'));
  assert.throws(() => applyAction(s, 'agent-900', {}));
});
test('forge validates a connected playable maze, never source code', () => {
  let s = make('game-forge');
  s = applyAction(s, 'agent-1', { type: 'submit', grid: maze });
  assert.equal(s.status, 'completed');
  assert.equal(s.artifact.kind, 'maze');
  assert.ok(s.checks.every(c => c.passed));
  assert.equal(s.metrics.pathLength, 8);
});
test('repair fixes seeded blocking tile and verifies path', () => {
  let s = make('repair-bay');
  const o = observe(s, 'agent-1');
  for (let x = 1; x < 6 && s.status === 'running'; x++) s = applyAction(s, 'agent-1', { type: 'repair', x, y: 3, tile: '.' });
  assert.equal(s.status, 'completed');
  assert.ok(s.checks.every(c => c.passed));
  assert.equal(o.artifact.grid[3], '#######');
});
test('runner hides maze until exploration and can reach seeded exit', () => {
  let s = make('game-runner');
  assert.equal(observe(s, 'agent-1').artifact, undefined);
  assert.ok(!JSON.stringify(observe(s, 'agent-1')).includes('blueprint'));
  const grid = s.artifact.grid;
  const queue = [[[1, 1], []]], seen = new Set(['1,1']);
  while (queue.length) {
    const [[x, y], path] = queue.shift();
    if (x === 5 && y === 5) {
      for (const direction of path) s = applyAction(s, 'agent-1', { type: 'move', direction });
      break;
    }
    for (const [direction, dx, dy] of [['east',1,0],['south',0,1],['west',-1,0],['north',0,-1]]) {
      const k = `${x+dx},${y+dy}`;
      if (!seen.has(k) && grid[y+dy]?.[x+dx] === '.') { seen.add(k); queue.push([[x+dx,y+dy],[...path,direction]]); }
    }
  }
  assert.equal(s.status, 'completed');
});
test('escape clues remain private until shared and unlock requires collaboration', () => {
  let s = make('escape-room');
  const first = observe(s, 'agent-1'), second = observe(s, 'agent-2');
  assert.notEqual(first.privateClue.digit, second.privateClue.digit);
  assert.equal(first.privateClues, undefined);
  const code = `${first.privateClue.digit}${second.privateClue.digit}`;
  s = applyAction(s, 'agent-1', { type: 'unlock', code });
  assert.equal(s.status, 'running');
  s = applyAction(s, 'agent-1', { type: 'share' });
  s = applyAction(s, 'agent-2', { type: 'share' });
  s = applyAction(s, 'agent-1', { type: 'unlock', code });
  assert.equal(s.status, 'completed');
});
test('civilization budgets resources and completes three concrete projects', () => {
  let s = make('tiny-civilization');
  for (const project of ['farm','shelter','reservoir']) {
    s = applyAction(s, 'agent-1', { type: 'allocate', project, food: 2, material: 2 });
  }
  assert.equal(s.status, 'completed');
  assert.equal(s.metrics.projectsCompleted, 3);
});
test('relay requires a different reviewer and publisher accepts only verified maze', () => {
  let s = make('relay-studio');
  s = applyAction(s, 'agent-1', { type: 'propose', grid: maze });
  s = applyAction(s, 'agent-1', { type: 'review' });
  assert.equal(s.events.at(-1).kind, 'invalid');
  s = applyAction(s, 'agent-2', { type: 'review' });
  s = applyAction(s, 'agent-1', { type: 'publish' });
  assert.equal(s.status, 'completed');
});
test('rule change triggers exactly on its configured step and is idempotent', () => {
  let s = make('game-forge', { ruleChangeStep: 2 });
  assert.deepEqual(intervene(s), s);
  s = applyAction(s, 'agent-1', { type: 'bad' });
  s = applyAction(s, 'agent-2', { type: 'bad' });
  assert.equal(s.ruleChanged, true);
  assert.equal(s.events.filter(e => e.kind === 'intervention').length, 1);
  assert.equal(s.events.find(e => e.kind === 'intervention').step, 2);
  assert.deepEqual(intervene(s), s);
  s = applyAction(s, 'agent-1', { type: 'submit', grid: maze });
  assert.equal(s.status, 'completed');
});
test('large payloads, extra keys and out of range repairs are rejected', () => {
  for (const action of [{type:'repair',x:-1,y:2,tile:'.'}, {type:'repair',x:1,y:1,tile:'.',secret:'x'}, {type:'repair',text:'x'.repeat(20000)}]) {
    const s = applyAction(make('repair-bay'), 'agent-1', action);
    assert.equal(s.events.at(-1).kind, 'invalid');
  }
});
test('failed maze connectivity never publishes a playable artifact', () => {
  const disconnected = ['#######','#.#####','#######','#######','#######','#####.#','#######'];
  const s = applyAction(make('game-forge'), 'agent-1', {type:'submit',grid:disconnected});
  assert.equal(s.status, 'running');
  assert.equal(s.artifact, null);
  assert.equal(s.checks.find(c => c.name === 'Playable route').passed, false);
});
test('intervention changes escape solution and reservoir cost', () => {
  let s = make('escape-room', { ruleChangeStep: 2 });
  const code = s.agents.map(a => observe(s,a).privateClue.digit).join('');
  s = applyAction(s, 'agent-1', {type:'share'});
  s = applyAction(s, 'agent-2', {type:'share'});
  s = applyAction(s, 'agent-1', {type:'unlock', code});
  assert.equal(s.status, 'running');
  s = applyAction(s, 'agent-2', {type:'unlock', code:[...code].reverse().join('')});
  assert.equal(s.status, 'completed');
  s = make('tiny-civilization', {ruleChangeStep: 2});
  for (const project of ['farm','shelter','reservoir']) s = applyAction(s, 'agent-1', {type:'allocate',project,food:2,material:2});
  assert.equal(s.status,'running');
  s = applyAction(s,'agent-2',{type:'allocate',project:'reservoir',food:1,material:1});
  assert.equal(s.status,'completed');
  assert.deepEqual(s.resources,{food:1,material:1});
});
test('intervention invalidates previous relay review and repair checkpoint is enforced', () => {
  let s = make('relay-studio',{ruleChangeStep:2});
  s = applyAction(s,'agent-1',{type:'propose',grid:maze});
  s = applyAction(s,'agent-2',{type:'review'});
  assert.equal(s.checks.find(c => c.name === 'Independent review').passed,false);
  s = applyAction(s,'agent-1',{type:'publish'});
  assert.equal(s.status,'running');
  assert.equal(s.reviewer,null);
  s = applyAction(s,'agent-2',{type:'review'});
  s = applyAction(s,'agent-1',{type:'publish'});
  assert.equal(s.status,'completed');
  s = make('repair-bay',{ruleChangeStep:1});
  s = applyAction(s,'agent-1',{type:'repair',x:1,y:1,tile:'.'});
  assert.deepEqual(s.artifact.checkpoint,[3,3]);
  s = applyAction(s,'agent-1',{type:'repair',x:1,y:3,tile:'.'});
  assert.equal(s.status,'running');
  s = applyAction(s,'agent-2',{type:'repair',x:3,y:3,tile:'.'});
  assert.equal(s.status,'completed');
});
test('after-turn intervention preserves observed action rules and skips completed runs', () => {
  let s = make('game-forge',{ruleChangeStep:1});
  s = applyAction(s,'agent-1',{type:'submit',grid:maze});
  assert.equal(s.status,'completed');
  assert.equal(s.ruleChanged,false);
  assert.equal(s.events.filter(e => e.kind === 'intervention').length,0);
  s = make('tiny-civilization',{ruleChangeStep:1});
  assert.equal(observe(s,'agent-1').projects.reservoir.requiredFood,2);
  s = applyAction(s,'agent-1',{type:'allocate',project:'reservoir',food:2,material:2});
  assert.equal(s.events.at(-1).kind,'intervention');
  assert.equal(s.projects.reservoir.food,2);
  assert.equal(observe(s,'agent-2').projects.reservoir.requiredFood,3);
  assert.equal(s.checks.find(c => c.name === 'reservoir').passed,false);
  assert.equal(s.metrics.projectsCompleted,0);
});
test('resource over-allocation is atomic and exhausted step limits cannot be bypassed', () => {
  let s = make('tiny-civilization',{maxSteps:1});
  s = applyAction(s,'agent-1',{type:'allocate',project:'farm',food:8,material:8});
  assert.deepEqual(s.resources,{food:8,material:8});
  assert.equal(s.events.at(-1).kind,'invalid');
  assert.throws(() => applyAction(s,'agent-2',{type:'allocate',project:'farm',food:2,material:2}), /step limit/);
});
test('seeds vary hidden maze and observations do not mutate internal state', () => {
  const s = make('game-runner'), another = make('game-runner',{seed:99});
  assert.notDeepEqual(s.artifact.grid,another.artifact.grid);
  const o = observe(s,'agent-1');
  o.explored['5,5'] = '.';
  o.agents.push('evil');
  assert.equal(s.explored['5,5'],undefined);
  assert.equal(s.agents.length,2);
});
