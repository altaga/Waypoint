// A real MCP client over Streamable HTTP (protocol 2025-11-25), written with fetch.
// It sends initialize, notifications/initialized, tools/list, tools/call and
// resources/read, reads JSON or SSE responses, and answers server-initiated
// elicitation/create requests on the same session.

export const PROTOCOL_VERSION = "2025-11-25";

export class McpClient {
  constructor({ url, user, onLog, onElicit }) {
    this.url = url;
    this.user = user;
    this.onLog = onLog || (() => {});
    this.onElicit = onElicit;
    this.sessionId = null;
    this.nextId = 1;
  }

  headers() {
    const h = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      "x-waypoint-user": this.user,
    };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  async initialize() {
    const result = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { elicitation: {} },
      clientInfo: { name: "waypoint-simulator", version: "0.1.0" },
    });
    await this.notify("notifications/initialized");
    return result;
  }

  listTools() {
    return this.request("tools/list", {});
  }

  callTool(name, args) {
    return this.request("tools/call", { name, arguments: args });
  }

  readResource(uri) {
    return this.request("resources/read", { uri });
  }

  request(method, params) {
    const id = this.nextId++;
    return this.send({ jsonrpc: "2.0", id, method, params }, id);
  }

  notify(method, params) {
    return this.post({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
  }

  async post(body) {
    this.onLog("→", body);
    const res = await fetch(this.url, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    return res;
  }

  async send(body, id) {
    const res = await this.post(body);
    if (res.status === 202) return undefined;
    if (!res.ok) throw new Error(`transport ${res.status}`);
    const type = res.headers.get("content-type") || "";
    if (type.includes("text/event-stream")) return this.readStream(res, id);
    const msg = await res.json();
    this.onLog("←", msg);
    if (msg.error) throw new Error(msg.error.message || "rpc error");
    return msg.result;
  }

  async readStream(res, id) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended before the response");
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = raw
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const msg = JSON.parse(data);
        this.onLog("←", msg);
        if (msg.method && msg.id !== undefined) {
          await this.answerServerRequest(msg);
          continue;
        }
        if (msg.id === id) {
          if (msg.error) throw new Error(msg.error.message || "rpc error");
          return msg.result;
        }
      }
    }
  }

  async answerServerRequest(msg) {
    if (msg.method === "elicitation/create" && this.onElicit) {
      const answer = await this.onElicit(msg.params);
      await this.post({ jsonrpc: "2.0", id: msg.id, result: answer });
      return;
    }
    await this.post({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not supported by this host" } });
  }

  async close() {
    if (!this.sessionId) return;
    await fetch(this.url, { method: "DELETE", headers: this.headers() }).catch(() => {});
    this.sessionId = null;
  }
}
