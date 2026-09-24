import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { TigerGraphConfig } from "./tigergraph.js";

// TigerGraph MCP backend: the same eight installed GSQL queries, called through the
// official tigergraph-mcp server (https://github.com/tigergraph/tigergraph-mcp) over stdio.
// The server is started with an allowlist, so the agent can only read the schema and run
// installed queries; it cannot write data, change the schema or run ad-hoc GSQL.
// Credentials come from the environment only (TG_HOST, TG_SECRET or TG_TOKEN) and are passed
// to the server process; they are never written to disk.

export const MCP_ALLOWED_TOOLS = ["tigergraph__get_graph_schema", "tigergraph__run_installed_query"] as const;

export interface McpSession { cfg: TigerGraphConfig; tools: string[]; schemaSummary: string; calls: McpCall[]; close: () => Promise<void> }
export interface McpCall { tool: string; query: string; ms: number }

export function parseMcpText(text: string): any {
  const m = text.match(/```json\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`Unexpected MCP response: ${text.slice(0, 200)}`);
  return JSON.parse(m[1]!);
}

export async function connectTigerGraphMcp(env: NodeJS.ProcessEnv = process.env): Promise<McpSession> {
  const host = (env.TG_HOST ?? "").replace(/\/+$/, "");
  const graph = env.TG_GRAPH ?? "GraphSentinel";
  if (!host) throw new Error("TG_HOST is not set");
  if (!env.TG_SECRET && !env.TG_TOKEN) throw new Error("Set TG_SECRET (a Savanna Database Secret) or TG_TOKEN");
  const childEnv: Record<string, string> = {
    PATH: env.PATH ?? "", HOME: env.HOME ?? "",
    TG_HOST: host, TG_GRAPHNAME: graph, TG_TGCLOUD: env.TG_TGCLOUD ?? "true",
    TG_ALLOWED_TOOLS: MCP_ALLOWED_TOOLS.join(","),
    ...(env.TG_SECRET ? { TG_SECRET: env.TG_SECRET } : {}),
    ...(env.TG_TOKEN ? { TG_API_TOKEN: env.TG_TOKEN } : {}),
  };
  const transport = new StdioClientTransport({ command: env.TG_MCP_BIN ?? "tigergraph-mcp", args: [], env: childEnv, stderr: "ignore" });
  const client = new Client({ name: "graphsentinel", version: "0.1.0" });
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map(t => t.name).sort();
  for (const t of MCP_ALLOWED_TOOLS) if (!tools.includes(t)) throw new Error(`MCP server does not expose ${t} (got: ${tools.join(", ")})`);
  const extra = tools.filter(t => !(MCP_ALLOWED_TOOLS as readonly string[]).includes(t));
  if (extra.length) throw new Error(`MCP server exposes tools outside the allowlist: ${extra.join(", ")}`);

  const calls: McpCall[] = [];
  const call = async (tool: string, args: Record<string, unknown>, label: string) => {
    const t0 = Date.now();
    const res = await client.callTool({ name: tool, arguments: args }) as { content?: { type: string; text?: string }[]; isError?: boolean };
    calls.push({ tool, query: label, ms: Date.now() - t0 });
    const text = (res.content ?? []).map(c => c.text ?? "").join("\n");
    const body = parseMcpText(text);
    if (res.isError || body.success === false) throw new Error(`MCP ${tool} ${label} failed: ${body.error ?? body.summary ?? text.slice(0, 200)}`);
    return body;
  };

  const schema = await call("tigergraph__get_graph_schema", { graph_name: graph }, graph);
  const schemaSummary = JSON.stringify(schema.data ?? {}).slice(0, 2000);

  const cfg: TigerGraphConfig = {
    host, graph, token: "", via: "mcp",
    run: async (name, params) => {
      const body = await call("tigergraph__run_installed_query", { query_name: name, params, graph_name: graph }, name);
      const results = body.data?.result;
      if (!Array.isArray(results)) throw new Error(`MCP run_installed_query ${name}: no result array`);
      return { endpoint: `mcp:tigergraph__run_installed_query/${graph}/${name}`, results };
    },
  };
  return { cfg, tools, schemaSummary, calls, close: () => client.close() };
}
