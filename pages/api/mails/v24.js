import fetch from "node-fetch";
const randomStr = (len = 12) => Math.random().toString(36).substring(2, 2 + len);
class TempMailClient {
  constructor({
    base = "https://api.internal.temp-mail.io/api/v3/"
  } = {}) {
    this.base = base;
  }
  async _call(method, path, body = null, query = {}) {
    const url = new URL(this.base + path);
    Object.entries(query).forEach(([k, v]) => url.searchParams.append(k, v));
    const opts = {
      method: method,
      headers: {
        "Content-Type": "application/json"
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) return await res.json();
    if (ct.includes("text") || ct.includes("eml")) return await res.text();
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
  async domains() {
    return await this._call("GET", "domains");
  }
  async create({
    name,
    domain,
    token
  } = {}) {
    let domainList = [];
    if (!domain) {
      try {
        const d = await this.domains();
        domainList = d?.domains ?? ["tempmail.com"];
      } catch {
        domainList = ["tempmail.com"];
      }
    }
    const finalDomain = domain || domainList[Math.floor(Math.random() * domainList.length)];
    const payload = {
      name: name ?? `user${Math.floor(Math.random() * 99999)}`,
      domain: finalDomain,
      token: token ?? `token_${randomStr()}`
    };
    return await this._call("POST", "email/new", payload);
  }
  async messages({
    email
  } = {}) {
    if (!email) throw new Error("email required");
    return await this._call("GET", `email/${email}/messages`);
  }
  async source({
    messageId
  } = {}) {
    if (!messageId) throw new Error("messageId required");
    return await this._call("GET", `message/${messageId}/source_code`);
  }
  async download({
    messageId
  } = {}) {
    if (!messageId) throw new Error("messageId required");
    const buf = await this._call("GET", `message/${messageId}/source_code`, null, {
      download: 1
    });
    return buf;
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  const api = new TempMailClient();
  try {
    let result;
    let status = 200;
    switch (action) {
      case "random":
        result = await api.create();
        status = 201;
        break;
      case "custom":
        if (!params.alias) {
          return res.status(400).json({
            success: false,
            error: "Missing 'alias'. Example: { alias: 'john', domain: 'tempmail.com' }"
          });
        }
        result = await api.create({
          name: params.alias,
          domain: params.domain
        });
        status = 201;
        break;
      case "messages":
        if (!params.email) {
          return res.status(400).json({
            success: false,
            error: "Missing 'email'. Example: { email: 'abc@tempmail.com' }"
          });
        }
        result = await api.messages({
          email: params.email
        });
        break;
      case "domains":
        result = await api.domains();
        break;
      case "source":
        if (!params.messageId) {
          return res.status(400).json({
            success: false,
            error: "Missing 'messageId'"
          });
        }
        result = await api.source({
          messageId: params.messageId
        });
        break;
      case "download":
        if (!params.messageId) {
          return res.status(400).json({
            success: false,
            error: "Missing 'messageId'"
          });
        }
        const buffer = await api.download({
          messageId: params.messageId
        });
        result = {
          filename: `${params.messageId}.eml`,
          content: buffer.toString("base64"),
          encoding: "base64",
          size: buffer.length
        };
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid action. Use: random, custom, messages, domains, source, download"
        });
    }
    return res.status(status).json(result);
  } catch (error) {
    console.error("API Error:", error.message);
    const httpStatus = error.message.includes("HTTP 4") ? 400 : 500;
    return res.status(httpStatus).json({
      success: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
}