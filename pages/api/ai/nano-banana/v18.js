import axios from "axios";
import FormData from "form-data";
import https from "https";
import SpoofHead from "@/lib/spoof-head";
class BananaAIClient {
  constructor() {
    this.apiBaseUrl = "https://nanobanana-free.site/api";
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
  }
  buildHeaders(isMultipart = false, additionalHeaders = {}) {
    const baseHeaders = {
      accept: "*/*",
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      priority: "u=1, i",
      referer: "https://nanobanana-free.site/",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
    if (!isMultipart) {
      baseHeaders["content-type"] = "application/json";
    }
    return {
      ...baseHeaders,
      ...additionalHeaders
    };
  }
  async _waitForCooldown() {
    console.log("Proses: Memeriksa status cooldown...");
    while (true) {
      try {
        const headers = this.buildHeaders(false);
        const response = await axios.get(`${this.apiBaseUrl}/generate-image`, {
          headers: headers,
          httpsAgent: this.httpsAgent
        });
        const {
          canGenerate,
          remainingCooldown
        } = response.data;
        if (canGenerate) {
          console.log("Proses: Cooldown selesai. Siap untuk membuat gambar.");
          break;
        } else {
          const waitTime = remainingCooldown || 5;
          console.log(`Proses: Cooldown aktif. Menunggu selama ${waitTime} detik...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1e3));
        }
      } catch (error) {
        console.error("Error saat memeriksa cooldown:", error.response?.data || error.message);
        console.log("Proses: Terjadi error, mencoba lagi dalam 10 detik...");
        await new Promise(resolve => setTimeout(resolve, 1e4));
      }
    }
  }
  async _getBuffer(imageUrl) {
    if (Buffer.isBuffer(imageUrl)) {
      console.log("Proses: imageUrl sudah berupa Buffer.");
      return imageUrl;
    }
    if (typeof imageUrl === "string") {
      if (imageUrl.startsWith("http")) {
        try {
          console.log("Proses: Mengunduh gambar dari URL...");
          const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            httpsAgent: this.httpsAgent
          });
          return Buffer.from(response.data);
        } catch (error) {
          console.error("Error saat mengunduh gambar:", error.message);
          throw new Error("Gagal mengunduh gambar dari URL.");
        }
      } else {
        try {
          console.log("Proses: Mengonversi base64 ke Buffer...");
          return Buffer.from(imageUrl, "base64");
        } catch (error) {
          console.error("Error saat konversi base64:", error.message);
          throw new Error("String imageUrl bukan base64 yang valid.");
        }
      }
    }
    throw new Error("Format imageUrl tidak didukung.");
  }
  async _presign(buffer) {
    try {
      console.log("Proses: Mengunggah gambar untuk mendapatkan presigned URL...");
      const formData = new FormData();
      formData.append("file", buffer, {
        filename: "background-replacer-result.png",
        contentType: "image/png"
      });
      formData.append("optimize", "true");
      const baseHeaders = this.buildHeaders(true);
      const formHeaders = formData.getHeaders();
      const response = await axios.post(`${this.apiBaseUrl}/upload-image`, formData, {
        headers: {
          ...baseHeaders,
          ...formHeaders
        },
        httpsAgent: this.httpsAgent
      });
      console.log("Proses: Berhasil mendapatkan presigned URL.");
      return response?.data?.url || null;
    } catch (error) {
      console.error("Error saat upload presign:", error.response?.data || error.message);
      throw new Error("Gagal mengunggah gambar untuk presign.");
    }
  }
  async generate({
    prompt = "a beautiful landscape",
    imageUrl,
    ...rest
  }) {
    try {
      await this._waitForCooldown();
      console.log("Proses: Memulai pembuatan gambar...");
      let finalImageUrl;
      if (imageUrl) {
        console.log("Proses: Mode Image-to-Image terdeteksi.");
        const imageBuffer = await this._getBuffer(imageUrl);
        finalImageUrl = await this._presign(imageBuffer);
        if (!finalImageUrl) throw new Error("Gagal mendapatkan presigned URL.");
      } else {
        console.log("Proses: Mode Text-to-Image terdeteksi.");
      }
      const payload = {
        prompt: prompt,
        width: rest?.width || 720,
        height: rest?.height || 1280,
        ...finalImageUrl ? {
          imageUrl: finalImageUrl
        } : {},
        ...rest
      };
      if (!payload.imageUrl) {
        delete payload.imageUrl;
      }
      console.log("Proses: Mengirim permintaan pembuatan gambar dengan payload:", payload);
      const headers = this.buildHeaders(false);
      const response = await axios.post(`${this.apiBaseUrl}/generate-image`, payload, {
        responseType: "arraybuffer",
        headers: headers,
        httpsAgent: this.httpsAgent
      });
      console.log("Proses: Berhasil membuat gambar, memulai unggahan hasil.");
      const resultBuffer = Buffer.from(response.data);
      const uploadResponse = await this._presign(resultBuffer);
      return uploadResponse;
    } catch (error) {
      console.error("Terjadi kesalahan pada proses utama:", error.response?.data || error.message);
      return null;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Prompt are required"
    });
  }
  try {
    const ai = new BananaAIClient();
    const response = await ai.generate(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}