import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateSchema } from "./schema-validator.mjs";

const stageRoot = path.dirname(fileURLToPath(import.meta.url));
const contractRoot = path.join(stageRoot, "contracts", "v1");
const examples = JSON.parse(fs.readFileSync(path.join(contractRoot, "examples.json"), "utf8"));
const schemaNames = [
  "resolved-repos.schema.json",
  "execution-unit.schema.json",
  "attempt-request.schema.json",
  "attempt-result.schema.json",
  "batch-state.schema.json",
  "event.schema.json",
  "needs-input.schema.json",
];

function loadSchema(name) {
  const schemaPath = path.join(contractRoot, name);
  return { schemaPath, schema: JSON.parse(fs.readFileSync(schemaPath, "utf8")) };
}

test("Stage 0 defines all seven versioned batch protocol schemas", () => {
  assert.deepEqual(
    fs.readdirSync(contractRoot)
      .filter((name) => name.endsWith(".schema.json"))
      .sort(),
    [...schemaNames].sort(),
  );
  for (const name of schemaNames) {
    const { schema } = loadSchema(name);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.$id, name);
    assert.equal(schema.properties.schemaVersion.const, 1);
    assert.equal(schema.additionalProperties, false);
  }
});

test("all Stage 0 protocol examples satisfy their schemas", () => {
  for (const name of schemaNames) {
    const { schema, schemaPath } = loadSchema(name);
    assert.deepEqual(validateSchema(examples[name], schema, schemaPath), [], name);
  }
});

test("attempt requests reject batch owner capabilities", () => {
  const { schema, schemaPath } = loadSchema("attempt-request.schema.json");
  assert.equal(Object.hasOwn(schema.properties, "leaseToken"), false);
  const unsafe = { ...examples["attempt-request.schema.json"], leaseToken: "owner-secret" };
  assert.match(validateSchema(unsafe, schema, schemaPath).join("\n"), /leaseToken is not allowed/);
});

test("execution-unit identity is distinct from repository identity", () => {
  const { schema, schemaPath } = loadSchema("execution-unit.schema.json");
  const invalid = { ...examples["execution-unit.schema.json"], scopeRoots: [] };
  assert.notEqual(examples["execution-unit.schema.json"].repoId, examples["execution-unit.schema.json"].executionUnitId);
  assert.match(validateSchema(invalid, schema, schemaPath).join("\n"), /fewer than 1 items/);
});

test("NeedsInput examples use stable unique question IDs", () => {
  const needsInput = examples["needs-input.schema.json"];
  const questionIds = needsInput.questions.map((question) => question.id);
  assert.equal(new Set(questionIds).size, questionIds.length);
  assert.equal(needsInput.answers.every((answer) => questionIds.includes(answer.questionId)), true);
});