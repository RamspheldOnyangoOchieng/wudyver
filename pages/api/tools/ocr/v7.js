import axios from "axios";
import { FormData, Blob } from "formdata-node";
import crypto from "crypto";

class OCR {
  constructor(apiKey = "4qlkYrXJ4Z255nLU35mnq84sr1VmMs9j1su18xlK") {
    this.apiKey = apiKey;
    this.baseURL = "https://nmwe4beyw1.execute-api.us-east-1.amazonaws.com/dev/recognize/";
    this.headers = {
      accept: "*/*",
      "accept-language": "id-ID,id;q=0.9",
      "cache-control": "no-cache",
      "content-type": "multipart/form-data",
      origin: "https://www.pen-to-print.com",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: "https://www.pen-to-print.com/",
      "sec-ch-ua": `"Chromium";v="131", "Not_A Brand";v="24", "Microsoft Edge Simulate";v="131", "Lemur";v="131"`,
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": `"Android"`,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "x-api-key": this.apiKey
    };
  }

  generateSession() {
    return crypto.randomUUID();
  }

  async generateHash(buffer) {
    let hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    let hashArray = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    let srcHash = "";
    for (let i = 0; i < 10; i++) {
      srcHash += hashArray[3 + 3 * i];
    }
    return srcHash;
  }

  async processImage(input, options = {}) {
    try {
      const isBuffer = Buffer.isBuffer(input);
      const isBase64 = typeof input === 'string' && input.startsWith('data:');
      const isUrl = typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'));

      const imageData = isBuffer ? await this.processBuffer(input, options)
        : isBase64 ? await this.processBase64(input)
        : isUrl ? await this.processUrl(input)
        : (() => { throw new Error("Unsupported input type") })();

      const session = this.generateSession();
      const srcHash = await this.generateHash(imageData.buffer);
      
      const form = new FormData();
      form.append("srcImg", new Blob([imageData.buffer], {
        type: imageData.contentType
      }), imageData.filename);
      form.append("srcHash", srcHash);
      form.append("includeSubScan", "1");
      form.append("userId", "undefined");
      form.append("session", session);
      form.append("appVersion", "1.0");

      let response;
      while (true) {
        response = await axios.post(this.baseURL, form, {
          headers: {
            ...this.headers,
            ...form.headers
          }
        });
        response.data.result === "1" && break;
        console.log(`Menunggu hasil OCR... (time: ${response.data.time}s)`);
        await new Promise(resolve => setTimeout(resolve, 2e3));
      }

      return response.data;
    } catch (error) {
      throw new Error(`Error recognizing image: ${error.message}`);
    }
  }

  async processUrl(url) {
    const { data: fileBuffer, headers } = await axios.get(url, { responseType: "arraybuffer" });
    const ext = headers["content-type"]?.split("/")[1] || "jpg";
    return {
      buffer: Buffer.from(fileBuffer),
      contentType: headers["content-type"] || "image/jpeg",
      filename: `file.${ext}`
    };
  }

  async processBase64(base64String) {
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const contentType = base64String.startsWith('data:image/png') ? "image/png" :
                       base64String.startsWith('data:image/gif') ? "image/gif" :
                       base64String.startsWith('data:image/webp') ? "image/webp" : "image/jpeg";
    
    const extension = contentType.split('/')[1];
    
    return { buffer, contentType, filename: `file.${extension}` };
  }

  async processBuffer(buffer, options = {}) {
    return {
      buffer,
      contentType: options.contentType || "image/jpeg",
      filename: options.filename || "file.jpg"
    };
  }
}

export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  
  !params.image && res.status(400).json({ error: "Image is required" });

  try {
    const ocr = new OCR();
    const data = await ocr.processImage(params.image, {
      contentType: params.contentType,
      filename: params.filename
    });
    
    return res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}