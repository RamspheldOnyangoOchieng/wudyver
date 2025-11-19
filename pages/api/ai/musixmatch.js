import axios from "axios";
class MusixMatchClient {
  constructor() {
    this.client = axios.create({
      baseURL: "https://leaves.mintlify.com/api/assistant",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
        Referer: "https://docs.musixmatch.com/lyrics-api/matcher/matcher-lyrics-get"
      }
    });
    this.threadId = null;
  }
  async chat({
    threadId,
    prompt,
    messages,
    ...rest
  }) {
    try {
      const useThreadId = threadId || this.threadId;
      const chatMessages = messages?.length ? messages : [{
        id: Date.now().toString(),
        role: "user",
        content: prompt,
        parts: [{
          type: "text",
          text: prompt
        }],
        createdAt: new Date().toISOString()
      }];
      const payload = {
        id: "musixmatch",
        messages: chatMessages,
        fp: "musixmatch",
        ...useThreadId && {
          threadId: useThreadId
        },
        ...rest
      };
      const response = await this.client.post("/musixmatch/message", payload);
      this.threadId = response.headers["x-thread-id"] || this.threadId;
      console.log(response?.data);
      const result = this.parse(response?.data);
      return {
        result: result,
        threadId: this.threadId,
        ...rest
      };
    } catch (error) {
      const invalidThread = error?.response?.data?.error?.includes("Invalid Thread ID");
      if (invalidThread) {
        return this.send({
          prompt: prompt,
          messages: messages,
          ...rest
        });
      }
      return {
        result: null,
        error: error?.response?.data || error?.message,
        threadId: this.threadId,
        ...rest
      };
    }
  }
  parse(data) {
    if (!data) return {
      text: ""
    };
    const result = {
      text: ""
    };
    for (const line of data.split("\n")) {
      if (!line.trim()) continue;
      const key = line[0];
      const payload = line.slice(2).trim();
      let obj;
      try {
        obj = JSON.parse(payload);
      } catch {
        if (key === "0" && payload.startsWith('"') && payload.endsWith('"')) {
          result.text += payload.slice(1, -1);
        }
        continue;
      }
      if (key === "0") {
        if (typeof obj === "string") {
          result.text += obj;
        } else if (obj && obj["0"]) {
          result.text += obj["0"];
        }
      } else if (obj && typeof obj === "object") {
        Object.assign(result, obj);
      }
    }
    return result;
  }
  getThread() {
    return this.threadId;
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Parameter 'prompt' diperlukan"
    });
  }
  const api = new MusixMatchClient();
  try {
    const data = await api.chat(params);
    return res.status(200).json(data);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses.";
    return res.status(500).json({
      error: errorMessage
    });
  }
}