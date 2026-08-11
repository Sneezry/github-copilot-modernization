import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  buildDotnetAppcatArgs,
  buildJavaAppcatArgs,
  buildNcuArgs,
  checkJavaAppcat,
  compareVersions,
  discoverDotnetInputs,
  findFilesRecursively,
  getJavaAppcatArchive,
  parseNcuOutput,
} from "./assess-runtime.mjs";

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "assess-runtime-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("compareVersions compares all numeric components", () => {
  assert.equal(compareVersions("7.7.0.8", "7.7.0.8"), 0);
  assert.equal(compareVersions("7.7.1", "7.7.0.8"), 1);
  assert.equal(compareVersions("7.6.9.99", "7.7.0.8"), -1);
  assert.equal(compareVersions("8.0", "8.0.0"), 0);
});

test(
  "checkJavaAppcat reads a fake executable version",
  { skip: process.platform === "win32" },
  () => {
    const homeDir = temporaryDirectory();
    const executable = path.join(homeDir, ".appcat", "appcat");
    writeFile(executable, "#!/bin/sh\necho 'AppCAT CLI 7.7.0.9'\n");
    fs.chmodSync(executable, 0o755);

    const result = checkJavaAppcat({ homeDir });

    assert.equal(result.installed, true);
    assert.equal(result.compatible, true);
    assert.equal(result.version, "7.7.0.9");
  },
);

test("checkJavaAppcat reports a missing installation", () => {
  const result = checkJavaAppcat({ homeDir: temporaryDirectory() });
  assert.equal(result.installed, false);
  assert.equal(result.compatible, false);
  assert.match(result.reason, /not found/i);
});

test("findFilesRecursively discovers matching files and honors ignores", () => {
  const root = temporaryDirectory();
  writeFile(path.join(root, "src", "one.csproj"));
  writeFile(path.join(root, "src", "nested", "two.csproj"));
  writeFile(path.join(root, "src", "obj", "ignored.csproj"));
  writeFile(path.join(root, "README.md"));

  const files = findFilesRecursively(
    root,
    (filePath) => filePath.endsWith(".csproj"),
    { ignoreDirectories: new Set(["obj"]) },
  );

  assert.deepEqual(
    files.map((filePath) => path.relative(root, filePath)).sort(),
    [path.join("src", "nested", "two.csproj"), path.join("src", "one.csproj")],
  );
});

test("discoverDotnetInputs prefers solutions and excludes bin and obj", () => {
  const root = temporaryDirectory();
  writeFile(path.join(root, "src", "App.csproj"));
  writeFile(path.join(root, "repo.slnx"));
  writeFile(path.join(root, "obj", "generated.sln"));

  assert.deepEqual(discoverDotnetInputs(root), [path.join(root, "repo.slnx")]);
});

test("Java AppCAT arguments include optional targeting controls", () => {
  assert.deepEqual(
    buildJavaAppcatArgs({
      workspacePath: "C:\\src",
      outputPath: "C:\\out",
      targets: ["azure-aks", "azure-appservice"],
      capabilities: ["containerization", "cloud-readiness"],
      targetOs: "linux",
      mode: "default",
    }),
    [
      "analyze",
      "--input",
      "C:\\src",
      "--output",
      "C:\\out",
      "--mode",
      "default",
      "--target",
      "azure-aks,azure-appservice",
      "--capability",
      "containerization,cloud-readiness",
      "--os",
      "linux",
      "--overwrite",
      "--output-format",
      "json",
      "--skip-static-report",
      "--code-snips-number",
      "-1",
    ],
  );
});

test("Java AppCAT archive mapping is platform and architecture specific", () => {
  assert.deepEqual(
    getJavaAppcatArchive({ platform: "win32", architecture: "x64" }),
    {
      url: "https://aka.ms/appcat/azure-migrate-appcat-for-java-cli-windows-amd64.zip",
      extension: "zip",
      platform: "windows",
      architecture: "amd64",
    },
  );
  assert.deepEqual(
    getJavaAppcatArchive({ platform: "darwin", architecture: "arm64" }),
    {
      url: "https://aka.ms/appcat/azure-migrate-appcat-for-java-cli-macos-arm64.tar.gz",
      extension: "tar.gz",
      platform: "macos",
      architecture: "arm64",
    },
  );
});

test(".NET AppCAT arguments use discovered project inputs", () => {
  const root = temporaryDirectory();
  const solution = path.join(root, "repo.slnx");
  writeFile(solution);
  const runDir = path.join(root, "results");

  const args = buildDotnetAppcatArgs({
    workspacePath: root,
    runDir,
  });

  assert.deepEqual(args.slice(0, 5), ["analyze", "--source", "Solution", "--target", "Any"]);
  assert.deepEqual(args.slice(-3), ["--report", path.join(runDir, "report.json"), solution]);
  assert.ok(args.includes("APPMODJSON"));
  assert.ok(args.includes("Protected"));
});

test(".NET AppCAT requires a solution file", () => {
  const root = temporaryDirectory();
  writeFile(path.join(root, "src", "App.csproj"));

  assert.throws(
    () => buildDotnetAppcatArgs({ workspacePath: root, runDir: path.join(root, "results") }),
    /No \.NET solution files/,
  );
});

test("parseNcuOutput converts grouped output into structured updates", () => {
  const groups = parseNcuOutput(`
Patch:
react 18.2.0 -> 18.2.1

[Major]
typescript 5.9.0 -> 6.0.0 breaking
@types/node 20.0.0 → 24.0.0
`);

  assert.deepEqual(groups, [
    {
      name: "Patch",
      updates: [{ package: "react", current: "18.2.0", latest: "18.2.1" }],
    },
    {
      name: "Major",
      updates: [
        { package: "typescript", current: "5.9.0", latest: "6.0.0" },
        { package: "@types/node", current: "20.0.0", latest: "24.0.0" },
      ],
    },
  ]);
});

test("NCU arguments pin the requested tool version", () => {
  assert.deepEqual(buildNcuArgs("C:\\src\\package.json"), [
    "--yes",
    "npm-check-updates@19.6.3",
    "--format",
    "group",
    "--packageFile",
    "C:\\src\\package.json",
  ]);
});