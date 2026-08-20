import type { AgentAction } from "./action.js";

const SAFE_TEST_COMMANDS = new Set(["npm test", "npm run test", "npm run ci", "npm run typecheck"]);

export function validateAgentAction(value: unknown): AgentAction {
  if (!value || typeof value !== "object") throw new Error("Action must be an object");
  const action = value as Record<string, unknown>;
  if (typeof action.type !== "string") throw new Error("Action requires type");

  switch (action.type) {
    case "read_file":
      return { type: "read_file", path: safePath(action.path), ...(typeof action.ref === "string" ? { ref: action.ref } : {}) };
    case "search_code":
      if (typeof action.query !== "string" || action.query.trim().length === 0) throw new Error("search_code requires query");
      return { type: "search_code", query: action.query.slice(0, 500) };
    case "write_file":
      if (typeof action.content !== "string" || typeof action.message !== "string" || action.message.trim().length === 0) throw new Error("write_file requires content and message");
      return { type: "write_file", path: safePath(action.path), content: action.content, message: action.message.slice(0, 200) };
    case "run_tests":
      if (typeof action.command !== "string" || !SAFE_TEST_COMMANDS.has(action.command)) throw new Error("Unsupported test command");
      return { type: "run_tests", command: action.command };
    case "report":
      if (typeof action.summary !== "string") throw new Error("report requires summary");
      return { type: "report", summary: action.summary };
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

function safePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Action requires path");
  if (value.startsWith("/") || value.includes("..") || value.includes("\\")) throw new Error("Unsafe repository path");
  return value;
}
