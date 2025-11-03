// pages/api/upscale-luca.js

import axios from "axios";
import FormData from "form-data";
import { EventSource } from "eventsource";

/**
 * Class untuk berinteraksi dengan API Upscaling Gambar Gradio dari Luca115.
 */
class LucaBestUpscaling {
  constructor() {
    this.baseURL = "https://luca115-best-upscaling-models.hf.space/gradio_api";
    // Header disesuaikan dengan cURL yang diberikan untuk upscaling
    this.headers = {
      "accept": "*/*",
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      "origin": "https://upsampler.com",
      "pragma": "no-cache",
      "priority": "u=1, i",
      "referer": "https://upsampler.com/",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    };
    this.uploadId = Math.random().toString(36).slice(2);
    this.sessionHash = "up" + Math.random().toString(36).slice(2); // Prefix 'up' untuk upscaling
  }

  /**
   * Mengunggah gambar (Buffer, URL, atau Base64) ke Gradio API.
   * Logika ini identik dengan LucaBackgroundRemove.
   */
  async upload(imageInput) {
    let buffer, mime, filename;
    try {
      if (Buffer.isBuffer(imageInput)) {
        buffer = imageInput;
        mime = this.detectMimeFromBuffer(buffer) || "image/png";
        filename = `upload.${mime.split("/")[1] || "png"}`;
      } else if (typeof imageInput === "string") {
        if (imageInput.startsWith("http")) {
          console.log(`[UPSCALING] Downloading from URL: ${imageInput}`);
          const imgRes = await axios.get(imageInput, {
            responseType: "arraybuffer",
            headers: this.headers
          });
          buffer = Buffer.from(imgRes.data);
          mime = imgRes.headers["content-type"] || "image/jpeg";
          filename = `upload.${mime.split("/")[1] || "jpg"}`;
        } else if (imageInput.startsWith("data:image/")) {
          console.log(`[UPSCALING] Processing data URL (base64)`);
          const matches = imageInput.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (!matches) throw new Error("Invalid data URL format");
          mime = matches[1];
          buffer = Buffer.from(matches[2], "base64");
          filename = `upload.${mime.split("/")[1]}`;
        } else if (/^[A-Za-z0-9+/=]+$/.test(imageInput.trim()) && imageInput.length > 50) {
          console.log(`[UPSCALING] Processing raw base64 string`);
          buffer = Buffer.from(imageInput.trim(), "base64");
          mime = this.detectMimeFromBuffer(buffer) || "image/png";
          filename = `upload.${mime.split("/")[1] || "png"}`;
        } else {
          throw new Error("imageUrl must be a valid URL, data URL, or base64 string");
        }
      } else {
        throw new Error("imageUrl must be string (URL/base64) or Buffer");
      }
      
      const form = new FormData();
      form.append("files", buffer, { filename, contentType: mime });
      
      const res = await axios.post(`${this.baseURL}/upload?upload_id=${this.uploadId}`, form, {
        headers: { ...this.headers, ...form.getHeaders() }
      });
      
      console.log(`[UPSCALING] Uploaded: ${res.data[0]}`);
      await this.waitUploadProgress();
      return { path: res.data[0], mime: mime };
    } catch (err) {
      console.error(`[UPSCALING] Upload failed:`, err.message);
      throw err;
    }
  }

  detectMimeFromBuffer(buffer) {
    const header = buffer.slice(0, 4).toString("hex").toLowerCase();
    if (header.startsWith("ffd8ffe")) return "image/jpeg";
    if (header.startsWith("89504e47")) return "image/png";
    if (header.startsWith("47494638")) return "image/gif";
    if (header.startsWith("52494646")) return "image/webp";
    return null;
  }

  waitUploadProgress() {
    return new Promise((resolve, reject) => {
      const es = new EventSource(`${this.baseURL}/upload_progress?upload_id=${this.uploadId}`, { headers: this.headers });
      es.onmessage = e => {
        if (e.data && e.data !== "[DONE]") {
          const data = JSON.parse(e.data);
          if (data.msg === "done") {
            es.close();
            resolve();
          }
        }
      };
      es.onerror = err => { es.close(); reject(err); };
    });
  }

  /**
   * Memulai proses upscaling dan memantau hasilnya.
   */
  async generate({ imageUrl, model }) {
    if (!imageUrl) throw new Error("imageUrl is required");
    
    const { path, mime } = await this.upload(imageUrl);
    const imageData = {
      path: path,
      meta: { _type: "gradio.FileData" }
    };

    // Menggunakan optional chaining dan logic OR untuk default model
    const selectedModel = model || "4xRealHATGANSharper";

    const payload = {
      data: [imageData, selectedModel], // Payload sesuai cURL: [gambar, model_string]
      event_data: null,
      fn_index: 1, // fn_index untuk upscaling adalah 1
      trigger_id: null,
      session_hash: this.sessionHash
    };
    
    console.log(`[UPSCALING] Joining queue with model: ${selectedModel}...`);
    await axios.post(`${this.baseURL}/queue/join?`, payload, {
      headers: { ...this.headers, 'content-type': 'application/json' }
    });
    
    return await this.autoPoll();
  }

  /**
   * Memantau antrian Gradio untuk mendapatkan hasil.
   */
  autoPoll() {
    return new Promise((resolve, reject) => {
      console.log("[UPSCALING] Polling result...");
      const es = new EventSource(`${this.baseURL}/queue/data?session_hash=${this.sessionHash}`, { headers: this.headers });
      
      es.onmessage = e => {
        if (!e.data || e.data === "[DONE]") return;
        let data;
        try {
          data = JSON.parse(e.data);
        } catch { return; }
        
        console.log(`[UPSCALING] ${data.msg}`);
        
        if (data.msg === "process_completed" && data.output) {
          es.close();
          resolve(data.output);
        } else if (data.msg === "process_failed") {
          es.close();
          reject(new Error("Upscaling process failed on the server."));
        }
      };
      
      es.onerror = () => {
        es.close();
        reject(new Error("Polling failed or connection lost"));
      };
      
      setTimeout(() => {
        es.close();
        reject(new Error("Upscaling process timeout (90s)"));
      }, 90000); // Timeout lebih lama untuk upscaling
    });
  }
}

/**
 * Handler untuk API route Next.js.
 */
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;

  if (!params.imageUrl) {
    return res.status(400).json({ error: "Parameter 'imageUrl' is required" });
  }

  try {
    const api = new LucaBestUpscaling();
    // params akan meneruskan imageUrl dan model (jika ada) ke fungsi generate
    const response = await api.generate(params); 
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}