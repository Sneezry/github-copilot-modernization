import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  calculateMaxConcurrency,
  computeFixtureDigest,
  summarizeMarkerEvents,
} from "./platform-probe.mjs";

const stageRoot = path.dirname(fileURLToPath(import.meta.url));
const evidencePath = path.join(stageRoot, "evidence", "platform-probe.json");

test("concurrency calculation handles overlapping marker intervals", () => {
  const events = [
    { probe: "fanout", marker: "A", event: "start", at: 10 },
    { probe: "fanout", marker: "B", event: "start", at: 20 },
    { probe: "fanout", marker: "A", event: "end", at: 30, failed: false },
    { probe: "fanout", marker: "B", event: "end", at: 40, failed: true },
  ];
  assert.equal(calculateMaxConcurrency(events), 2);
  assert.deepEqual(summarizeMarkerEvents(events, "fanout"), {
    starts: 2,
    ends: 2,
    markers: ["A", "B"],
    failedMarkers: ["B"],
    maxConcurrency: 2,
  });
});

test("recorded platform evidence matches the current probe fixture", () => {
  assert.equal(fs.existsSync(evidencePath), true, "run platform-probe.mjs to create evidence");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.status, "passed");
  assert.match(evidence.copilotVersion, /GitHub Copilot CLI \d+\.\d+\.\d+/);
  assert.equal(evidence.fixtureSha256, computeFixtureDigest());
  assert.deepEqual(evidence.probes.repeatInvocation.markers, ["ALPHA", "BETA"]);
  assert.equal(evidence.probes.depthAndToolInheritance.positive.markers.includes("DEPTH-4"), true);
  assert.equal(evidence.probes.depthAndToolInheritance.positive.markers.includes("DEPTH-5-ERROR"), false);
  assert.equal(evidence.probes.depthAndToolInheritance.missingParentTool.markers.length, 0);
  assert.deepEqual(evidence.probes.fanout.map((probe) => probe.requested), [1, 2, 6, 7]);
  for (const probe of evidence.probes.fanout) {
    assert.equal(probe.starts, probe.requested);
    assert.equal(probe.ends, probe.requested);
    assert.equal(probe.maxConcurrency >= 1, true);
    assert.equal(probe.maxConcurrency <= probe.requested, true);
    assert.equal(["overlapped", "serialized"].includes(probe.observedScheduling), true);
  }
  assert.equal(typeof evidence.probes.fanoutSummary.allMultiChildRunsOverlapped, "boolean");
  assert.equal(evidence.probes.partialFailure.starts, 7);
  assert.equal(evidence.probes.partialFailure.ends, 7);
  assert.deepEqual(evidence.probes.partialFailure.failedMarkers, ["FANOUT-4"]);
});