import test from "node:test";
import assert from "node:assert/strict";
import { randomPersona, personaPrompt } from "../persona.mjs";

test("randomPersona is deterministic per seed and complete", () => {
  const a = randomPersona("seed-1");
  const b = randomPersona("seed-1");
  const c = randomPersona("seed-2");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const key of ["temperament", "coreDrive", "riskAppetite", "voice", "blindSpot", "privateFear"]) {
    assert.equal(typeof a[key], "string");
    assert.ok(a[key].length > 0);
  }
});

test("personaPrompt renders traits and handles missing persona", () => {
  const persona = randomPersona("seed-1");
  const prompt = personaPrompt(persona);
  assert.ok(prompt.includes(persona.temperament));
  assert.ok(prompt.includes(persona.privateFear));
  assert.equal(personaPrompt(null), "");
});
