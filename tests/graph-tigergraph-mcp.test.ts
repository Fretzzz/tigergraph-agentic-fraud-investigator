import { describe, expect, it } from "vitest";
import { parseMcpText, MCP_ALLOWED_TOOLS } from "../packages/graph-tigergraph/src/mcp.js";
import { prefetchEvidence, type TigerGraphConfig } from "../packages/graph-tigergraph/src/tigergraph.js";
import { syntheticSlice } from "./graph-local.test.js";

// Shape produced by tigergraph-mcp's response formatter: a fenced JSON block, then human-readable text.
const sample = (body: unknown) => "```json\n" + JSON.stringify(body, null, 2) + "\n```\n\n**Success: Query 'gs_seed_context' executed successfully**";

describe("TigerGraph MCP transport (offline)", () => {
  it("parses the structured block of an MCP tool response", () => {
    const body = parseMcpText(sample({ success: true, operation: "run_installed_query", data: { query_name: "gs_seed_context", result: [{ Seed: [] }] } }));
    expect(body.success).toBe(true);
    expect(body.data.result).toEqual([{ Seed: [] }]);
  });

  it("rejects a response without a structured block", () => {
    expect(() => parseMcpText("plain text")).toThrow(/Unexpected MCP response/);
  });

  it("allowlists read-only tools only", () => {
    expect([...MCP_ALLOWED_TOOLS].sort()).toEqual(["tigergraph__get_graph_schema", "tigergraph__run_installed_query"]);
  });

  it("routes installed-query calls through the MCP transport when one is configured", async () => {
    const calls: string[] = [];
    const cfg: TigerGraphConfig = { host: "https://example.invalid", graph: "GraphSentinel", token: "", via: "mcp",
      run: async (name) => { calls.push(name); return { endpoint: `mcp:tigergraph__run_installed_query/GraphSentinel/${name}`, results: [] }; } };
    await expect(prefetchEvidence(cfg, syntheticSlice())).rejects.toThrow(/not found in TigerGraph/);
    expect(calls).toEqual(["gs_seed_context"]);
  });
});
