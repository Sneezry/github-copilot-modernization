import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const stageRoot = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(stageRoot, "fixtures", "platform-probe");
const defaultEvidencePath = path.join(stageRoot, "evidence", "platform-probe.json");
const fanoutCounts = [1, 2, 6, 7];

function walkFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(root, entry.name);
      return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
    })
    .sort();
}

export function computeFixtureDigest(root = fixtureRoot) {
  const hash = crypto.createHash("sha256");
  for (const filePath of walkFiles(root)) {
    hash.update(path.relative(root, filePath).replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function calculateMaxConcurrency(events) {
  const points = events
    .filter((event) => event.event === "start" || event.event === "end")
    .map((event) => ({ at: event.at, delta: event.event === "start" ? 1 : -1 }))
    .sort((left, right) => left.at - right.at || right.delta - left.delta);
  let active = 0;
  let maximum = 0;
  for (const point of points) {
    active += point.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

export function summarizeMarkerEvents(events, probe) {
  const selected = events.filter((event) => event.probe === probe);
  const starts = selected.filter((event) => event.event === "start");
  const ends = selected.filter((event) => event.event === "end");
  return {
    starts: starts.length,
    ends: ends.length,
    markers: starts.map((event) => event.marker),
    failedMarkers: ends.filter((event) => event.failed).map((event) => event.marker),
    maxConcurrency: calculateMaxConcurrency(selected),
  };
}

function resolveCopilotBinary(explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }

  const pathEntries = String(process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const names = process.platform === "win32"
    ? ["copilot.exe", "copilot.bat", "copilot.cmd", "copilot"]
    : ["copilot"];
  for (const name of names) {
    for (const entry of pathEntries) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error("Copilot CLI executable was not found on PATH; set COPILOT_CLI_PATH");
}

function parseMarkerLog(logPath) {
  if (!fs.existsSync(logPath)) {
    return [];
  }
  return fs.readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function responseTail(output) {
  return String(output ?? "").replace(/\s+/g, " ").trim().slice(-500);
}

function invokeProbe(copilotPath, agent, prompt, label, { allowFailure = false } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `batch-stage0-${label}-`));
  const logPath = path.join(tempRoot, "markers.jsonl");
  const startedAt = Date.now();
  const result = spawnSync(copilotPath, [
    "-C",
    fixtureRoot,
    "--plugin-dir",
    fixtureRoot,
    `--agent=batch-stage0-probe:${agent}`,
    "--prompt",
    prompt,
    "--allow-all-tools",
    "--disable-builtin-mcps",
    "--no-custom-instructions",
    "--no-remote",
    "--no-remote-export",
    "--no-color",
    "--silent",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      NO_COLOR: "1",
      STAGE0_PROBE_LOG: logPath,
    },
    maxBuffer: 50 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
    windowsHide: true,
  });
  const durationMs = Date.now() - startedAt;
  const events = parseMarkerLog(logPath);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (result.error && !allowFailure) {
    throw result.error;
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${label} exited ${result.status}: ${responseTail(result.stderr)}`);
  }
  return {
    label,
    exitCode: result.status,
    durationMs,
    responseTail: responseTail(result.stdout),
    errorTail: responseTail(result.stderr),
    events,
  };
}

function assertProbe(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runRepeatProbe(copilotPath) {
  const run = invokeProbe(
    copilotPath,
    "repeat",
    "Run the repeat invocation probe exactly as specified.",
    "repeat",
  );
  const summary = summarizeMarkerEvents(run.events, "repeat");
  assertProbe(summary.starts === 2 && summary.ends === 2, "repeat did not execute exactly twice");
  assertProbe(summary.markers.join(",") === "ALPHA,BETA", "repeat markers were contaminated or reordered");
  const alphaEnd = run.events.find((event) => event.event === "end" && event.marker === "ALPHA")?.at;
  const betaStart = run.events.find((event) => event.event === "start" && event.marker === "BETA")?.at;
  assertProbe(alphaEnd <= betaStart, "repeat invocations were not sequential");
  return { status: "passed", ...summary, durationMs: run.durationMs, responseTail: run.responseTail };
}

function runDepthProbe(copilotPath) {
  const positive = invokeProbe(
    copilotPath,
    "depth-root",
    "Run the complete depth probe exactly as specified.",
    "depth-positive",
  );
  const positiveSummary = summarizeMarkerEvents(positive.events, "depth");
  assertProbe(positiveSummary.markers.includes("DEPTH-4"), "depth 4 could not call the inherited MCP tool");
  assertProbe(!positiveSummary.markers.includes("DEPTH-5-ERROR"), "depth 5 unexpectedly started");

  const negative = invokeProbe(
    copilotPath,
    "depth-root-missing-tool",
    "Run the negative inherited-tool probe exactly as specified.",
    "depth-missing-tool",
    { allowFailure: true },
  );
  const negativeSummary = summarizeMarkerEvents(negative.events, "depth");
  assertProbe(!negativeSummary.markers.includes("DEPTH-4"), "child regained an MCP tool removed by its parent");
  assertProbe(!negativeSummary.markers.includes("DEPTH-5-ERROR"), "negative probe unexpectedly reached depth 5");

  return {
    status: "passed",
    positive: {
      ...positiveSummary,
      durationMs: positive.durationMs,
      responseTail: positive.responseTail,
    },
    missingParentTool: {
      ...negativeSummary,
      exitCode: negative.exitCode,
      durationMs: negative.durationMs,
      responseTail: negative.responseTail,
      errorTail: negative.errorTail,
    },
  };
}

function runFanoutProbe(copilotPath, count, failIndex = 0) {
  const run = invokeProbe(
    copilotPath,
    "fanout",
    `count=${count} delayMs=1200 failIndex=${failIndex}`,
    failIndex ? `fanout-${count}-failure-${failIndex}` : `fanout-${count}`,
    { allowFailure: failIndex > 0 },
  );
  const summary = summarizeMarkerEvents(run.events, "fanout");
  assertProbe(summary.starts === count, `fanout ${count} launched ${summary.starts} children`);
  assertProbe(summary.ends === count, `fanout ${count} completed ${summary.ends} children`);
  assertProbe(new Set(summary.markers).size === count, `fanout ${count} reused a marker`);
  assertProbe(summary.maxConcurrency >= 1, `fanout ${count} recorded no active child`);
  assertProbe(summary.maxConcurrency <= count, `fanout ${count} exceeded its requested count`);
  const expectedFailures = failIndex ? [`FANOUT-${failIndex}`] : [];
  assertProbe(
    summary.failedMarkers.join(",") === expectedFailures.join(","),
    `fanout ${count} failure markers did not match the injected failure`,
  );
  return {
    status: "passed",
    requested: count,
    injectedFailureIndex: failIndex,
    observedScheduling: summary.maxConcurrency > 1 ? "overlapped" : "serialized",
    ...summary,
    durationMs: run.durationMs,
    responseTail: run.responseTail,
    exitCode: run.exitCode,
  };
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

export function runPlatformProbes({ outputPath = defaultEvidencePath, copilotPath, resume = false } = {}) {
  const executable = resolveCopilotBinary(copilotPath ?? process.env.COPILOT_CLI_PATH);
  const versionResult = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  if (versionResult.status !== 0) {
    throw new Error(`Unable to read Copilot CLI version: ${responseTail(versionResult.stderr)}`);
  }

  const fixtureSha256 = computeFixtureDigest();
  let previousEvidence = null;
  if (resume && fs.existsSync(outputPath)) {
    const candidate = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (candidate.fixtureSha256 === fixtureSha256) {
      previousEvidence = candidate;
    }
  }
  const evidence = {
    schemaVersion: 1,
    status: "running",
    generatedAt: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    nodeVersion: process.version,
    copilotVersion: String(versionResult.stdout).trim(),
    fixtureSha256,
    probes: previousEvidence?.probes ?? {},
  };
  if (previousEvidence) {
    evidence.resumedFrom = previousEvidence.generatedAt;
  }
  atomicWriteJson(outputPath, evidence);

  try {
    if (!evidence.probes.repeatInvocation) {
      evidence.probes.repeatInvocation = runRepeatProbe(executable);
      atomicWriteJson(outputPath, evidence);
    }
    if (!evidence.probes.depthAndToolInheritance) {
      evidence.probes.depthAndToolInheritance = runDepthProbe(executable);
      atomicWriteJson(outputPath, evidence);
    }
    evidence.probes.fanout ??= [];
    for (const count of fanoutCounts.slice(evidence.probes.fanout.length)) {
      evidence.probes.fanout.push(runFanoutProbe(executable, count));
      atomicWriteJson(outputPath, evidence);
    }
    if (!evidence.probes.partialFailure) {
      evidence.probes.partialFailure = runFanoutProbe(executable, 7, 4);
      atomicWriteJson(outputPath, evidence);
    }
    evidence.probes.fanoutSummary = {
      maxObservedConcurrency: Math.max(...evidence.probes.fanout.map((probe) => probe.maxConcurrency)),
      serializedCounts: evidence.probes.fanout
        .filter((probe) => probe.requested > 1 && probe.maxConcurrency === 1)
        .map((probe) => probe.requested),
    };
    evidence.probes.fanoutSummary.allMultiChildRunsOverlapped =
      evidence.probes.fanoutSummary.serializedCounts.length === 0;
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error.message;
    throw error;
  } finally {
    evidence.completedAt = new Date().toISOString();
    atomicWriteJson(outputPath, evidence);
  }
  return evidence;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outputPath = optionValue("--output") ?? defaultEvidencePath;
    const evidence = runPlatformProbes({
      outputPath: path.resolve(outputPath),
      copilotPath: optionValue("--copilot"),
      resume: process.argv.includes("--resume"),
    });
    console.log(JSON.stringify({ status: evidence.status, outputPath: path.resolve(outputPath) }));
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}