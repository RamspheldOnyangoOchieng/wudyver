import axios from "axios";
class CaptchaSolver {
  constructor() {
    this.config = {
      v1: {
        baseUrl: "https://api.paxsenix.org/tools/"
      },
      v2: {
        baseUrl: "https://anabot.my.id/api/tools/bypass"
      },
      v3: {
        baseUrl: "http://91.99.150.24:3024/api/solve-turnstile-min"
      }
    };
    this.bases = ["v1", "v2", "v3"];
  }
  async _solveWithSingleBase({
    url,
    sitekey,
    ver,
    act = "turnstile",
    type = "turnstile-min",
    ...rest
  }) {
    switch (ver) {
      case "v1": {
        const endpoint = {
          turnstile: "cf-turnstile-solver",
          hcaptcha: "hcaptcha-invisible-solver",
          recaptchav3: "recaptchav3-invis-solver"
        } [act] || "cf-turnstile-solver";
        const apiUrl = `${this.config.v1.baseUrl}${endpoint}`;
        const response = await axios.get(apiUrl, {
          params: {
            url: url,
            sitekey: sitekey
          },
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
          }
        });
        const token = response.data?.solution_token;
        if (response.data?.ok && token) {
          return {
            token: token,
            ver: ver,
            act: act
          };
        }
        const message = response.data?.message || "Respons tidak valid atau token tidak ditemukan";
        throw new Error(`[v1] Paxsenix gagal: ${message}`);
      }
      case "v2": {
        const params = {
          url: url,
          siteKey: sitekey,
          type: type,
          apikey: "freeApikey",
          ...rest
        };
        const response = await axios.get(this.config.v2.baseUrl, {
          params: params,
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
          }
        });
        const token = response.data?.data?.result?.token;
        if (response.data?.success && token) {
          return {
            token: token,
            ver: ver,
            act: type
          };
        }
        throw new Error("[v2] Anabot gagal: Respons tidak berhasil atau token tidak ditemukan");
      }
      case "v3": {
        const response = await axios.post(this.config.v3.baseUrl, {
          url: url,
          siteKey: sitekey
        }, {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
          }
        });
        const token = response.data?.data;
        if (token) {
          return {
            token: token,
            ver: ver,
            act: "turnstile-min"
          };
        }
        throw new Error("[v3] Base v3 gagal: Respons tidak berhasil atau token tidak ditemukan");
      }
      default:
        throw new Error(`Versi API tidak didukung: ${ver}`);
    }
  }
  async solve(params) {
    let lastError = null;
    for (const base of this.bases) {
      try {
        const result = await this._solveWithSingleBase({
          ...params,
          ver: base
        });
        return result;
      } catch (error) {
        lastError = error;
        console.error(`Gagal mencoba base ${base}: ${error.message}`);
      }
    }
    throw new Error(`Semua basis penyelesaian captcha gagal. Kesalahan terakhir: ${lastError.message}`);
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.sitekey || !params.url) {
    return res.status(400).json({
      error: "sitekey and url are required for CaptchaSolver."
    });
  }
  try {
    const solver = new CaptchaSolver();
    const response = await solver.solve(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}