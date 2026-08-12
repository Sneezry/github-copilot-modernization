import assert from "node:assert/strict";
import test from "node:test";

import {
  FACT_SKILL_IDS,
  SECURITY_SKILL_IDS,
} from "../../../skills/assessment/scripts/assessment-catalog.mjs";
import {
  aggregateTaskResults,
  buildWaves,
} from "./assessment-capacity-contract.mjs";

const capacities = [1, 2, 6, 7];

function syntheticResults(taskIds) {
  return taskIds.map((taskId) => ({
    taskId,
    status: "completed",
    artifact: `${taskId}.result`,
  }));
}

for (const [inventoryName, taskIds] of [
  ["facts", FACT_SKILL_IDS],
  ["security", SECURITY_SKILL_IDS],
]) {
  test(`${inventoryName} result contract is invariant across capacities 1, 2, 6, and 7`, () => {
    const expected = aggregateTaskResults(taskIds, syntheticResults(taskIds));
    for (const capacity of capacities) {
      const waves = buildWaves(taskIds, capacity);
      assert.deepEqual(waves.flat(), taskIds);
      assert.equal(waves.every((wave) => wave.length <= capacity), true);
      const completionOrder = waves.flatMap((wave) => [...wave].reverse());
      const results = completionOrder.map((taskId) =>
        syntheticResults(taskIds).find((result) => result.taskId === taskId));
      assert.deepEqual(aggregateTaskResults(taskIds, results), expected, `capacity=${capacity}`);
    }
  });
}

test("partial Assessment remains partial regardless of completion order", () => {
  const results = syntheticResults(SECURITY_SKILL_IDS);
  results[3] = { ...results[3], status: "failed" };
  const expected = aggregateTaskResults(SECURITY_SKILL_IDS, results);
  assert.equal(expected.status, "completed_with_issues");
  assert.deepEqual(
    aggregateTaskResults(SECURITY_SKILL_IDS, [...results].reverse()),
    expected,
  );
});

test("aggregation fails closed on missing, duplicate, or unknown task results", () => {
  const results = syntheticResults(FACT_SKILL_IDS);
  assert.throws(() => aggregateTaskResults(FACT_SKILL_IDS, results.slice(1)), /Missing task results/);
  assert.throws(() => aggregateTaskResults(FACT_SKILL_IDS, [...results, results[0]]), /Duplicate task result/);
  assert.throws(
    () => aggregateTaskResults(FACT_SKILL_IDS, [...results, { taskId: "unexpected", status: "completed" }]),
    /Unexpected task result/,
  );
});