import fetch from "node-fetch";
class MailTmClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || "https://api.mail.tm";
  }
  log(message, level = "info") {
    const time = new Date().toISOString().slice(11, 19);
    const colorMap = {
      info: "[36m",
      error: "[31m",
      success: "[32m"
    };
    const resetColor = "[0m";
    const coloredMessage = `${colorMap[level] || colorMap.info}[${time}][${level.toUpperCase()}] ${message}${resetColor}`;
    console.log(coloredMessage);
  }
  randStr(length = 10) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({
      length: length
    }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }
  async req({
    path,
    method = "GET",
    headers = {},
    body = null,
    query = null
  }) {
    const url = `${this.baseUrl}${path || "/"}`;
    const queryString = query ? `?${new URLSearchParams(query)}` : "";
    const fullUrl = `${url}${queryString}`;
    this.log(`${method} ${fullUrl}`, "info");
    const options = {
      method: method,
      headers: {
        "Content-Type": "application/ld+json",
        ...headers
      }
    };
    if ((method === "POST" || method === "PUT" || method === "PATCH") && body) {
      options.body = JSON.stringify(body);
    }
    try {
      const response = await fetch(fullUrl, options);
      const status = response?.status || 0;
      const statusText = response?.statusText || "Unknown";
      this.log(`Response: ${status} ${statusText}`, status >= 200 && status < 300 ? "success" : "error");
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage = errorBody?.message || errorBody?.detail || `${status} ${statusText}`;
        const error = new Error(`HTTP ${status}: ${errorMessage}`);
        error.status = status;
        error.details = errorBody;
        this.log(`Error Response: ${JSON.stringify(errorBody, null, 2)}`, "error");
        throw error;
      }
      const data = status === 204 ? {
        success: true,
        message: "Resource deleted successfully"
      } : await response.json().catch(() => null);
      if (data && data.token) {
        this.log(`Response Data (Token): ${JSON.stringify({
...data,
token: "******"
}, null, 2)}`, "success");
      } else if (data) {
        this.log(`Response Data: ${JSON.stringify(data, null, 2)}`, "success");
      }
      return data;
    } catch (error) {
      if (error.status) throw error;
      this.log(`Request failed: ${error?.message || "Unknown error"}`, "error");
      throw new Error(`Connection Error: ${error?.message || "Unknown error"}`);
    }
  }
  async domains({
    page = 1
  } = {}) {
    const data = await this.req({
      path: "/domains",
      query: {
        page: page
      }
    });
    return data?.["hydra:member"] || [];
  }
  async createAccount({
    address,
    password
  }) {
    return this.req({
      path: "/accounts",
      method: "POST",
      body: {
        address: address,
        password: password
      }
    });
  }
  async token({
    address,
    password
  }) {
    return this.req({
      path: "/token",
      method: "POST",
      body: {
        address: address,
        password: password
      }
    });
  }
  async delete_account({
    accountId,
    token
  }) {
    return this.req({
      path: `/accounts/${accountId}`,
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  async message({
    page = 1,
    token,
    allPages = false
  }) {
    if (!token) {
      throw new Error("Token is required to fetch messages.");
    }
    let allMessages = [];
    let currentPage = page;
    let hasMore = true;
    while (hasMore) {
      const data = await this.req({
        path: "/messages",
        query: {
          page: currentPage
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const messagesList = data?.["hydra:member"] || [];
      if (!messagesList || messagesList.length === 0 || !allPages) {
        hasMore = false;
        if (!allPages) return messagesList;
      }
      allMessages = [...allMessages, ...messagesList];
      const hasNext = data?.["hydra:view"]?.["hydra:next"];
      if (allPages && hasNext) {
        currentPage++;
      } else {
        hasMore = false;
      }
    }
    return allMessages;
  }
  async message_by_id({
    messageId,
    token
  }) {
    if (!messageId || !token) {
      throw new Error("messageId and token are required.");
    }
    return this.req({
      path: `/messages/${messageId}`,
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  async delete_message({
    messageId,
    token
  }) {
    if (!messageId || !token) {
      throw new Error("messageId and token are required.");
    }
    return this.req({
      path: `/messages/${messageId}`,
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  async create({
    ...rest
  }) {
    let domain = rest?.domain;
    if (!domain) {
      const domains = await this.domains({
        page: 1
      });
      domain = domains?.[0]?.domain;
      if (!domain) {
        throw new Error("No domain available from Mail.tm");
      }
    }
    let address = rest?.address;
    if (address && !address.includes("@")) {
      address = `${address}@${domain}`;
    } else if (!address) {
      address = `user-${this.randStr(10)}@${domain}`;
    }
    const password = rest?.password || this.randStr(12);
    this.log(`Attempting to create: ${address}`, "info");
    const account = await this.createAccount({
      address: address,
      password: password
    });
    const accountId = account?.id;
    const tokenResponse = await this.token({
      address: address,
      password: password
    });
    const token = tokenResponse?.token;
    if (!token || !accountId) {
      throw new Error("Failed to get token after account creation.");
    }
    return {
      token: token,
      address: address,
      password: password,
      accountId: accountId,
      accountInfo: account
    };
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  const api = new MailTmClient();
  try {
    let result;
    let status = 200;
    switch (action) {
      case "create":
        result = await api.create(params);
        status = 201;
        break;
      case "token":
        if (!params.address || !params.password) {
          return res.status(400).json({
            success: false,
            error: "Missing 'address' or 'password' parameters. Example: { action: 'token', address: 'user@domain.com', password: 'xyz' }"
          });
        }
        result = await api.token(params);
        break;
      case "message":
        if (!params.token) {
          return res.status(400).json({
            success: false,
            error: "Missing 'token' parameter. Example: { action: 'message', token: 'jwt-token', page: 1 }"
          });
        }
        result = await api.message(params);
        break;
      case "message_by_id":
        if (!params.messageId || !params.token) {
          return res.status(400).json({
            success: false,
            error: "Missing 'messageId' or 'token' parameters. Example: { action: 'message_by_id', messageId: '12345', token: 'jwt-token' }"
          });
        }
        result = await api.message_by_id(params);
        break;
      case "domains":
        result = await api.domains(params);
        break;
      case "delete_account":
        if (!params.accountId || !params.token) {
          return res.status(400).json({
            success: false,
            error: "Missing 'accountId' or 'token' parameters. Example: { action: 'delete_account', accountId: 'id-akun', token: 'jwt-token' }"
          });
        }
        result = await api.delete_account(params);
        break;
      case "delete_message":
        if (!params.messageId || !params.token) {
          return res.status(400).json({
            success: false,
            error: "Missing 'messageId' or 'token' parameters. Example: { action: 'delete_message', messageId: '12345', token: 'jwt-token' }"
          });
        }
        result = await api.delete_message(params);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid action. Use 'create', 'token', 'message', 'message_by_id', 'domains', 'delete_account', or 'delete_message'."
        });
    }
    return res.status(status).json(result);
  } catch (error) {
    console.error(`API Handler Error:`, error.message);
    const errorStatus = error.status;
    const status = errorStatus || (error.message.includes("HTTP 4") ? 400 : error.message.includes("HTTP 5") ? 500 : 500);
    return res.status(status).json({
      success: false,
      error: error.message,
      details: error.details,
      timestamp: Date.now()
    });
  }
}