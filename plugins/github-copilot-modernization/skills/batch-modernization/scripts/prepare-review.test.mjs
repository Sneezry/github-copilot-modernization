import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { formatReviewHandoff, prepareBatchReview } from "./prepare-review.mjs";

function createRepository(root, name) {
  const repositoryPath = path.join(root, "repos", name);
  fs.mkdirSync(path.join(repositoryPath, "src"), { recursive: true });
  fs.writeFileSync(path.join(repositoryPath, "package.json"), `${JSON.stringify({ name })}\n`);
  fs.writeFileSync(path.join(repositoryPath, "src", "index.js"), "export default true;\n");
  return repositoryPath;
}

test("prepareBatchReview writes a read-only handoff", (t) => {
  const launchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "batch-review-test-"));
  t.after(() => fs.rmSync(launchRoot, { recursive: true, force: true }));
  const repositories = ["alpha-service", "beta-service"].map((name) => ({
    name,
    path: createRepository(launchRoot, name),
  }));
  const configPath = path.join(launchRoot, ".github", "modernize", "repos.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify({ repos: repositories }, null, 2)}\n`);

  const review = prepareBatchReview({
    configPath,
    launchRoot,
    allowedRoots: [launchRoot],
    domains: ["cloud-readiness"],
    analysisCoverage: "issue-only",
    maxConcurrency: 1,
    batchId: "review-test",
  });

  assert.deepEqual(review.selectedExecutionUnitIds, ["alpha-service", "beta-service"]);
  assert.deepEqual(review.approvedNeedsAttention, ["alpha-service", "beta-service"]);
  assert.equal(review.groups.needsAttention.length, 2);
  assert.match(review.configSha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(review.batchRoot, "review.json")), true);
  assert.equal(fs.existsSync(path.join(review.batchRoot, "REVIEW.md")), true);
  assert.equal(fs.existsSync(review.resolvedReposPath), true);
  assert.equal(fs.existsSync(review.inspectedReposPath), true);
  for (const forbidden of [
    "manifest.json",
    "state.json",
    "lease.json",
    "selection.json",
    "assessment-input.json",
    "attempts",
  ]) {
    assert.equal(fs.existsSync(path.join(review.batchRoot, forbidden)), false);
  }

  const handoff = formatReviewHandoff(review);
  assert.match(handoff, /^# Stage 1B Batch Assessment Review/m);
  assert.match(handoff, /BATCH_REVIEW_READY/);
  assert.match(handoff, /selectedExecutionUnitIds: \["alpha-service","beta-service"\]/);
  assert.match(handoff, /approvedNeedsAttention: \["alpha-service","beta-service"\]/);
});

test("prepareBatchReview rejects invalid decisions before creating a preview", () => {
  assert.throws(
    () => prepareBatchReview({
      configPath: path.resolve("repos.json"),
      launchRoot: path.resolve("workspace"),
      domains: ["unsupported"],
    }),
    /supported Assessment domains/,
  );
});