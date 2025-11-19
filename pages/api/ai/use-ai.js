import axios from "axios";
import {
  wrapper
} from "axios-cookiejar-support";
import {
  CookieJar
} from "tough-cookie";
import {
  v4 as uuidv4
} from "uuid";
import SpoofHead from "@/lib/spoof-head";
class AIChatClient {
  constructor() {
    this.CHAT_URL_INIT = "https://use.ai/id/chat";
    this.CHAT_URL_API = "https://use.ai/v1/chat";
    this.USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36";
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      timeout: 3e4,
      headers: {
        "User-Agent": this.USER_AGENT,
        "Accept-Language": "id-ID",
        ...SpoofHead()
      }
    }));
    this._cookiesInit = false;
  }
  _generateHex(length) {
    return [...Array(length)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
  }
  _genData(chatId = uuidv4()) {
    const messageId = this._generateHex(16).toUpperCase();
    const sentryTraceId = this._generateHex(32);
    const sentrySpanId = this._generateHex(16);
    const sentrySampleRand = Math.random().toFixed(18);
    return {
      chatId: chatId,
      messageId: messageId,
      sentryTraceId: sentryTraceId,
      sentrySpanId: sentrySpanId,
      sentrySampleRand: sentrySampleRand,
      traceHeader: `${sentryTraceId}-${sentrySpanId}-0`,
      referer: `https://use.ai/id/chat/${chatId}`
    };
  }
  async _initialRequest() {
    if (this._cookiesInit) {
      return;
    }
    const headers = {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Cache-Control": "max-age=0",
      Referer: "https://duckduckgo.com/",
      "Upgrade-Insecure-Requests": "1"
    };
    try {
      console.log(`[INIT] Melakukan permintaan GET ke ${this.CHAT_URL_INIT} untuk mendapatkan cookie sesi...`);
      await this.client.get(this.CHAT_URL_INIT, {
        headers: headers
      });
      this._cookiesInit = true;
      console.log("[INIT] Cookie sesi berhasil didapatkan.");
    } catch (error) {
      console.error("Gagal pada Langkah Initial Request:", error.message);
      throw error;
    }
  }
  _parseStream(rawData) {
    const lines = rawData.split("\n");
    let fullText = "";
    let info = {
      ai_message_id: null,
      is_done: false,
      provider_metadata: null,
      start_time: Date.now(),
      end_time: null
    };
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.substring(6).trim();
        if (jsonStr === "[DONE]") {
          info.is_done = true;
          break;
        }
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === "text-start") {
            info.ai_message_id = data.id;
            info.provider_metadata = data.providerMetadata;
          } else if (data.type === "text-delta" && data.id === info.ai_message_id) {
            fullText += data.delta;
          } else if (data.type === "finish") {
            info.is_done = true;
            info.end_time = Date.now();
          }
        } catch (e) {}
      }
    }
    if (!info.end_time) {
      info.end_time = Date.now();
    }
    return {
      fullText: fullText.trim(),
      ...info
    };
  }
  async chat({
    chat_id,
    prompt,
    messages = [],
    ...rest
  }) {
    if (!prompt) {
      throw new Error("Parameter 'prompt' wajib diisi.");
    }
    if (!this._cookiesInit) {
      await this._initialRequest();
    }
    const s = this._genData(chat_id);
    const baggageHeader = `sentry-environment=production,sentry-release=3cd9b20bf71dbfb536dcebb060fe282828c1db39,sentry-public_key=905ff2a259425fa7167e7994687e7056,sentry-trace_id=${s.sentryTraceId},sentry-org_id=4509668407246848,sentry-sampled=false,sentry-sample_rand=${s.sentrySampleRand},sentry-sample_rate=0.01`;
    const headers = {
      Accept: "*/*",
      "Content-Type": "application/json",
      Origin: "https://use.ai",
      Referer: s.referer,
      baggage: baggageHeader,
      "sentry-trace": s.traceHeader
    };
    const userMessage = {
      parts: [{
        type: "text",
        text: prompt
      }],
      id: s.messageId,
      role: "user"
    };
    const messagePayload = messages.length ? messages.concat(userMessage) : [userMessage];
    const payload = {
      chatId: s.chatId,
      messages: messagePayload,
      selectedChatModel: "gateway-gpt-5",
      selectedVisibilityType: "private",
      retryLastMessage: false
    };
    try {
      console.log(`\n[CHAT] Mengirim pesan untuk chatId: ${s.chatId}. Pesan: "${prompt.substring(0, 30)}..."`);
      const response = await this.client.post(this.CHAT_URL_API, payload, {
        headers: headers,
        responseType: "text"
      });
      const {
        fullText,
        ...info
      } = this._parseStream(response.data);
      console.log("[CHAT] Respons AI berhasil diproses.");
      return {
        result: fullText,
        chat_id: s.chatId,
        prompt_id: s.messageId,
        ...info
      };
    } catch (error) {
      console.error("[ERROR] Gagal mengirim pesan chat:", error.message);
      if (error.response) {
        const errorData = error.response.data.substring(0, 500) + (error.response.data.length > 500 ? "..." : "");
        console.error("[ERROR] Respons Server (Detail):", errorData);
      }
      throw error;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Parameter 'prompt' diperlukan"
    });
  }
  const api = new AIChatClient();
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