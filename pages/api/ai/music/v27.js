import axios from "axios";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import SpoofHead from "@/lib/spoof-head";
import apiConfig from "@/configs/apiConfig";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class WudysoftAPI {
  constructor() {
    this.client = axios.create({
      baseURL: `https://${apiConfig.DOMAIN_URL}/api`
    });
  }
  async createPaste(title, content) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      return response.data?.key || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.createPaste': ${error.message}`);
      throw error;
    }
  }
  async getPaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      return response.data?.content || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.getPaste' untuk kunci ${key}: ${error.message}`);
      return null;
    }
  }
  async listPastes() {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "list"
        }
      });
      return response.data || [];
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.listPastes': ${error.message}`);
      return [];
    }
  }
  async delPaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "delete",
          key: key
        }
      });
      return response.data || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.delPaste' untuk kunci ${key}: ${error.message}`);
      return false;
    }
  }
}
class MusicMakerAIAPI {
  constructor() {
    this.cookieJar = new CookieJar();
    this.baseURL = "https://www.musicmakerai.net";
    const commonHeaders = {
      "accept-language": "id-ID",
      origin: this.baseURL,
      referer: `${this.baseURL}/`,
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
    this.client = wrapper(axios.create({
      baseURL: this.baseURL,
      jar: this.cookieJar,
      withCredentials: true,
      headers: {
        ...commonHeaders,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin"
      }
    }));
    this.wudysoft = new WudysoftAPI();
  }
  _random() {
    return Math.random().toString(36).substring(2, 12);
  }
  _generateRandomCredentials() {
    const username = `user_${this._random()}`;
    const email = `${this._random()}@temp-mail.io`;
    const password = `${this._random().substring(0, 6)}A1!`;
    return {
      username: username,
      email: email,
      password: password
    };
  }
  async _performRegistration() {
    console.log("\n====== MEMULAI PROSES REGISTRASI MUSICMAKERAI ======");
    const {
      username,
      email,
      password
    } = this._generateRandomCredentials();
    console.log(`Proses: Username: ${username}`);
    console.log(`Proses: Email: ${email}`);
    console.log(`Proses: Password: ${password}`);
    try {
      await this.client.get("/register");
      console.log("Proses: Halaman register berhasil diakses.");
    } catch (error) {
      console.error("Proses: Error saat mengakses halaman register:", error.message);
    }
    const formData = new URLSearchParams();
    formData.append("name", username);
    formData.append("country", "Indonesia");
    formData.append("email", email);
    formData.append("password", password);
    formData.append("password2", password);
    formData.append("acao", "cad");
    try {
      const response = await this.client.post("/functionx.php", formData, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: `${this.baseURL}/register`
        },
        maxRedirects: 5
      });
      console.log("Proses: Registrasi berhasil dikirim.");
      await this.client.get("/create");
      console.log("Proses: Halaman create berhasil diakses.");
      const sessionData = {
        username: username,
        email: email,
        password: password,
        cookies: await this.cookieJar.getCookies(this.baseURL)
      };
      console.log("\n====== REGISTRASI SELESAI ======\n");
      return sessionData;
    } catch (error) {
      console.error(`Proses registrasi gagal: ${error.message}`);
      throw error;
    }
  }
  async _getSessionFromKey(key) {
    console.log(`Proses: Memuat sesi dari kunci: ${key}`);
    const savedSession = await this.wudysoft.getPaste(key);
    if (!savedSession) throw new Error(`Sesi dengan kunci "${key}" tidak ditemukan.`);
    try {
      const sessionData = JSON.parse(savedSession);
      console.log("Proses: Sesi berhasil dimuat.");
      return sessionData;
    } catch (e) {
      throw new Error(`Gagal memuat sesi: ${e.message}`);
    }
  }
  async _ensureValidSession({
    key
  }) {
    let sessionData;
    let currentKey = key;
    if (key) {
      try {
        sessionData = await this._getSessionFromKey(key);
        for (const cookie of sessionData.cookies) {
          await this.cookieJar.setCookie(`${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`, this.baseURL);
        }
      } catch (error) {
        console.warn(`[PERINGATAN] ${error.message}. Mendaftarkan sesi baru...`);
      }
    }
    if (!sessionData) {
      console.log("Proses: Kunci tidak valid atau tidak disediakan, mendaftarkan sesi baru...");
      const newSession = await this.register();
      if (!newSession?.key) throw new Error("Gagal mendaftarkan sesi baru.");
      console.log(`-> PENTING: Simpan kunci baru ini: ${newSession.key}`);
      currentKey = newSession.key;
      sessionData = await this._getSessionFromKey(currentKey);
      for (const cookie of sessionData.cookies) {
        await this.cookieJar.setCookie(`${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`, this.baseURL);
      }
    }
    return {
      sessionData: sessionData,
      key: currentKey
    };
  }
  async register() {
    try {
      console.log("Proses: Mendaftarkan sesi baru...");
      const sessionData = await this._performRegistration();
      const sessionToSave = JSON.stringify(sessionData);
      const sessionTitle = `musicmakerai-session-${this._random()}`;
      const newKey = await this.wudysoft.createPaste(sessionTitle, sessionToSave);
      if (!newKey) throw new Error("Gagal menyimpan sesi baru.");
      console.log(`-> Sesi baru berhasil didaftarkan. Kunci Anda: ${newKey}`);
      return {
        key: newKey
      };
    } catch (error) {
      console.error(`Proses registrasi gagal: ${error.message}`);
      throw error;
    }
  }
  async list_key() {
    try {
      console.log("Proses: Mengambil daftar semua kunci sesi...");
      const allPastes = await this.wudysoft.listPastes();
      return allPastes.filter(paste => paste.title && paste.title.startsWith("musicmakerai-session-")).map(paste => paste.key);
    } catch (error) {
      console.error("Gagal mengambil daftar kunci:", error.message);
      throw error;
    }
  }
  async del_key({
    key
  }) {
    if (!key) {
      console.error("Kunci tidak disediakan untuk dihapus.");
      return false;
    }
    try {
      console.log(`Proses: Mencoba menghapus kunci: ${key}`);
      const success = await this.wudysoft.delPaste(key);
      console.log(success ? `Kunci ${key} berhasil dihapus.` : `Gagal menghapus kunci ${key}.`);
      return success;
    } catch (error) {
      console.error(`Terjadi error saat menghapus kunci ${key}:`, error.message);
      throw error;
    }
  }
  async generate({
    key,
    name = "My Song",
    voice = "",
    ritmo = "Samba",
    temaIA = "",
    prompt = "Beautiful music with amazing melody"
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      console.log(`Proses: Membuat musik dengan nama "${name}"...`);
      const formData = new URLSearchParams();
      formData.append("ckletra", "1");
      formData.append("name", name);
      formData.append("voice", voice);
      formData.append("ritmo", ritmo);
      formData.append("temaIA", temaIA);
      formData.append("letra2", prompt);
      const response = await this.client.post("/function_ri.php", formData, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: `${this.baseURL}/create`
        },
        maxRedirects: 5
      });
      console.log("Proses: Request pembuatan musik berhasil dikirim.");
      return {
        success: true,
        message: "Musik sedang dibuat. Gunakan method status() untuk mengecek hasil.",
        key: currentKey
      };
    } catch (error) {
      const errorMessage = error.response?.data || error.message;
      console.error(`Proses create gagal: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
  async status({
    key
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      console.log("Proses: Mengecek status musik...");
      const response = await this.client.get("/gerador.php", {
        headers: {
          referer: `${this.baseURL}/create`
        }
      });
      console.log("Proses: Response status berhasil didapatkan.");
      const $ = cheerio.load(response.data);
      const songs = [];
      $("li.single-item").each((i, elem) => {
        const $elem = $(elem);
        const coverImg = $elem.find(".single-item__cover img").attr("src");
        const downloadUrl = $elem.find(".single-item__cover").attr("href");
        const title = $elem.find(".single-item__title h4 a").text().trim();
        const genre = $elem.find(".single-item__title span a").text().trim();
        const shareLink = $elem.find("a.open-modal[data-link]").attr("data-link");
        if (downloadUrl && downloadUrl.includes(".mp3")) {
          songs.push({
            title: title,
            genre: genre,
            coverImage: coverImg,
            downloadUrl: downloadUrl,
            shareLink: shareLink
          });
        }
      });
      console.log(`Proses: Ditemukan ${songs.length} lagu.`);
      return {
        success: true,
        songs: songs,
        key: currentKey
      };
    } catch (error) {
      const errorMessage = error.response?.data || error.message;
      console.error(`Proses status gagal: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Parameter 'action' wajib diisi."
    });
  }
  const api = new MusicMakerAIAPI();
  try {
    let response;
    switch (action) {
      case "register":
        response = await api.register();
        break;
      case "generate":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib diisi untuk action 'generate'."
          });
        }
        response = await api.generate(params);
        break;
      case "list_key":
        response = await api.list_key();
        break;
      case "del_key":
        if (!params.key) {
          return res.status(400).json({
            error: "Parameter 'key' wajib diisi untuk action 'del_key'."
          });
        }
        response = await api.del_key(params);
        break;
      case "status":
        if (!params.key) {
          return res.status(400).json({
            error: "Parameter 'key' wajib diisi untuk action 'status'."
          });
        }
        response = await api.status(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung: 'register', 'generate', 'list_key', 'del_key' dan 'status'.`
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    return res.status(500).json({
      error: error.message || "Terjadi kesalahan internal pada server."
    });
  }
}