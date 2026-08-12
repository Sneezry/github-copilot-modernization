import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const logPath = path.resolve(process.env.STAGE0_PROBE_LOG ?? ".stage0-probe-events.jsonl");

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function appendEvent(event) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, "utf8");
}

function toolResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

async function handleRequest(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "stage0-probe-mcp", version: "1.0.0" },
    };
  }

  if (message.method === "ping") {
    return {};
  }

  if (message.method === "tools/list") {
    return {
      tools: [
        {
          name: "record_marker",
          description: "Record a timed Stage 0 probe marker",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["probe", "marker"],
            properties: {
              probe: { type: "string", minLength: 1 },
              marker: { type: "string", minLength: 1 },
              delayMs: { type: "integer", minimum: 0, maximum: 5000 },
              fail: { type: "boolean" },
            },
          },
        },
      ],
    };
  }

  if (message.method === "tools/call" && message.params?.name === "record_marker") {
    const args = message.params.arguments ?? {};
    const delayMs = Number.isInteger(args.delayMs) ? args.delayMs : 0;
    const base = {
      probe: String(args.probe ?? ""),
      marker: String(args.marker ?? ""),
      pid: process.pid,
    };
    appendEvent({ ...base, event: "start", at: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    appendEvent({ ...base, event: "end", at: Date.now(), failed: args.fail === true });
    return toolResult(
      JSON.stringify({ probe: base.probe, marker: base.marker, failed: args.fail === true }),
      args.fail === true,
    );
  }

  throw new Error(`Unsupported method: ${message.method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.id === undefined) {
    return;
  }

  handleRequest(message).then(
    (result) => send({ jsonrpc: "2.0", id: message.id, result }),
    (error) => send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32603, message: error.message },
    }),
  );
});