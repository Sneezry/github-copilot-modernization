#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectResolvedRepositories } from "./inspect-workspaces.mjs";
import { resolveReposFile } from "./resolve-repos.mjs";

const SUPPORTED_DOMAINS = new Set(["security", "cloud-readiness", "java-upgrade"]);
const SUPPORTED_COVERAGE = new Set(["issue-only", "full"]);

export class BatchReviewError extends Error {
  constructor(message, code = "batch_review_failed") {
    super(message);
    this.name = "BatchReviewError";
    this.code = code;
  }
}

function atomicWrite(filePath, content) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temporaryPath, absolutePath);
}

function atomicWriteJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validateDecisions({ domains, analysisCoverage, maxConcurrency }) {
  if (!Array.isArray(domains)
      || domains.length === 0
      || new Set(domains).size !== domains.length
      || domains.some((domain) => !SUPPORTED_DOMAINS.has(domain))) {
    throw new BatchReviewError("Review requires unique supported Assessment domains", "invalid_decisions");
  }
  if (!SUPPORTED_COVERAGE.has(analysisCoverage)) {
    throw new BatchReviewError("Review coverage must be issue-only or full", "invalid_decisions");
  }
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 7) {
    throw new BatchReviewError("Review maxConcurrency must be between 1 and 7", "invalid_decisions");
  }
}

function repositoryEntry(repository) {
  return {
    repoId: repository.repoId,
    name: repository.name,
    workspacePath: repository.workspacePath,
    executionUnitIds: repository.executionUnits.map((unit) => unit.executionUnitId),
    languages: [...new Set(repository.executionUnits.flatMap((unit) => unit.languages))],
    warnings: repository.warnings,
    errors: repository.errors,
  };
}

function markdownReview(review) {
  const lines = [
    "# Stage 1B Batch Assessment Review",
    "",
    `Status: ${review.status}`,
    "",
    "## Selection",
    "",
    ...review.selectedExecutionUnitIds.map((executionUnitId) => `- ${executionUnitId}`),
    "",
    "## Decisions",
    "",
    `- Domains: ${review.decisions.domains.join(", ")}`,
    `- Coverage: ${review.decisions.analysisCoverage}`,
    `- Max concurrency: ${review.decisions.maxConcurrency}`,
    "- Repository scheduling: sequential",
    "",
    "## Preflight",
    "",
    `- Ready: ${review.groups.ready.length}`,
    `- Needs attention: ${review.groups.needsAttention.length}`,
    `- Clone required: ${review.groups.cloneRequired.length}`,
    `- Blocked: ${review.groups.blocked.length}`,
    "",
  ];
  for (const [heading, entries] of [
    ["Ready", review.groups.ready],
    ["Needs attention", review.groups.needsAttention],
    ["Clone required", review.groups.cloneRequired],
    ["Blocked", review.groups.blocked],
  ]) {
    if (entries.length === 0) continue;
    lines.push(`### ${heading}`, "");
    for (const entry of entries) {
      const details = [...entry.warnings, ...entry.errors];
      lines.push(`- ${entry.repoId}${details.length > 0 ? `: ${details.join("; ")}` : ""}`);
    }
    lines.push("");
  }
  lines.push(`Result directory: ${review.batchRoot}`, "");
  return lines.join("\n");
}

export function formatReviewHandoff(review) {
  const fields = [
    "BATCH_REVIEW_READY",
    `batchRoot: ${review.batchRoot}`,
    `inspectedReposPath: ${review.inspectedReposPath}`,
    `configSha256: ${review.configSha256}`,
    `selectedExecutionUnitIds: ${JSON.stringify(review.selectedExecutionUnitIds)}`,
    `approvedNeedsAttention: ${JSON.stringify(review.approvedNeedsAttention)}`,
    `domains: ${JSON.stringify(review.decisions.domains)}`,
    `analysisCoverage: ${review.decisions.analysisCoverage}`,
    `maxConcurrency: ${review.decisions.maxConcurrency}`,
  ];
  return `${review.markdown}\n${fields.join("\n")}\n`;
}

export function prepareBatchReview({
  configPath,
  launchRoot,
  allowedRoots = [],
  domains = ["cloud-readiness"],
  analysisCoverage = "issue-only",
  maxConcurrency = 1,
  selectedExecutionUnitIds,
  batchId,
} = {}) {
  if (!path.isAbsolute(launchRoot ?? "") || !path.isAbsolute(configPath ?? "")) {
    throw new BatchReviewError("Review launch root and config path must be absolute", "invalid_path");
  }
  validateDecisions({ domains, analysisCoverage, maxConcurrency });
  const absoluteLaunchRoot = path.resolve(launchRoot);
  const absoluteConfigPath = path.resolve(configPath);
  const resolved = resolveReposFile(absoluteConfigPath, { launchRoot: absoluteLaunchRoot });
  const authorizedRoots = allowedRoots.length > 0 ? allowedRoots : [absoluteLaunchRoot];
  const inspected = inspectResolvedRepositories(resolved, {
    allowedRoots: authorizedRoots.map((root) => path.resolve(root)),
  });
  const allUnits = inspected.repositories.flatMap((repository) =>
    repository.executionUnits.map((unit) => ({ repository, unit })));
  const selectable = allUnits.filter(({ repository }) => repository.preflightStatus !== "blocked");
  const selectedIds = selectedExecutionUnitIds?.length > 0
    ? selectedExecutionUnitIds
    : selectable.map(({ unit }) => unit.executionUnitId);
  if (selectedIds.length === 0 || new Set(selectedIds).size !== selectedIds.length) {
    throw new BatchReviewError("Review requires at least one unique execution unit", "invalid_selection");
  }
  const selected = selectedIds.map((executionUnitId) => {
    const matches = selectable.filter(({ unit }) => unit.executionUnitId === executionUnitId);
    if (matches.length !== 1) {
      throw new BatchReviewError(
        `Execution unit is not uniquely selectable: ${executionUnitId}`,
        "invalid_selection",
      );
    }
    return matches[0];
  });

  const stableBatchId = batchId ?? `batch-review-${crypto.randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(stableBatchId)) {
    throw new BatchReviewError("Review batch ID is invalid", "invalid_batch_id");
  }
  const batchesRoot = path.join(absoluteLaunchRoot, ".github", "modernize", "batches");
  const batchRoot = path.join(batchesRoot, stableBatchId);
  fs.mkdirSync(batchesRoot, { recursive: true });
  fs.mkdirSync(batchRoot, { recursive: false });
  const scratchRoot = path.join(batchRoot, "scratch");
  fs.mkdirSync(scratchRoot);
  const resolvedReposPath = path.join(scratchRoot, "resolved-repos.json");
  const inspectedReposPath = path.join(scratchRoot, "inspected-repos.json");
  atomicWriteJson(resolvedReposPath, resolved);
  atomicWriteJson(inspectedReposPath, inspected);

  const cloneRequired = inspected.repositories.filter((repository) =>
    repository.warnings.includes("repository clone is required"));
  const groups = {
    ready: inspected.repositories.filter((repository) => repository.preflightStatus === "ready")
      .map(repositoryEntry),
    needsAttention: inspected.repositories.filter((repository) =>
      repository.preflightStatus === "needs_attention" && !cloneRequired.includes(repository))
      .map(repositoryEntry),
    cloneRequired: cloneRequired.map(repositoryEntry),
    blocked: inspected.repositories.filter((repository) => repository.preflightStatus === "blocked")
      .map(repositoryEntry),
  };
  const review = {
    schemaVersion: 1,
    status: "ready_for_approval",
    batchId: stableBatchId,
    batchRoot,
    launchRoot: absoluteLaunchRoot,
    resolvedReposPath,
    inspectedReposPath,
    configSha256: inspected.configSha256,
    selectedExecutionUnitIds: selectedIds,
    approvedNeedsAttention: selected
      .filter(({ repository }) => repository.preflightStatus === "needs_attention")
      .map(({ unit }) => unit.executionUnitId),
    decisions: { domains, analysisCoverage, maxConcurrency, repositoryScheduling: "sequential" },
    apps: inspected.apps,
    groups,
  };
  review.markdown = markdownReview(review);
  atomicWriteJson(path.join(batchRoot, "review.json"), review);
  atomicWrite(path.join(batchRoot, "REVIEW.md"), `${review.markdown}\n`);
  return review;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function optionValues(name) {
  return process.argv.flatMap((value, index) => value === name ? [process.argv[index + 1]] : []);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const domainValues = optionValues("--domain");
    const review = prepareBatchReview({
      configPath: optionValue("--config"),
      launchRoot: optionValue("--launch-root"),
      allowedRoots: optionValues("--allowed-root"),
      domains: domainValues.length > 0 ? domainValues : undefined,
      analysisCoverage: optionValue("--coverage") ?? "issue-only",
      maxConcurrency: Number(optionValue("--max-concurrency") ?? 1),
      selectedExecutionUnitIds: optionValues("--execution-unit-id"),
      batchId: optionValue("--batch-id"),
    });
    process.stdout.write(formatReviewHandoff(review));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      code: error.code ?? "batch_review_failed",
      message: error.message,
    })}\n`);
    process.exitCode = 1;
  }
}