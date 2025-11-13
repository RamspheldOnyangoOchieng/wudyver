import fetch from "node-fetch";
import CryptoJS from "crypto-js";
import * as cheerio from "cheerio";
import FormData from "form-data";
import PROMPT from "@/configs/ai-prompt";
class AIClient {
  constructor() {
    this.key = CryptoJS.enc.Utf8.parse("vOVH6sdmpNWjRRIq");
    this.cfg = {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    };
    this.configUrl = "https://conf.masyadi.com/api/v1/config";
    this.uploadUrl = null;
    this.submitUrl = null;
    this.pollUrl = null;
    this.baseConfig = null;
  }
  encrypt(text) {
    try {
      const enc = CryptoJS.AES.encrypt(text, this.key, this.cfg);
      return enc.ciphertext.toString(CryptoJS.enc.Base64);
    } catch (e) {
      console.log("❌ Encrypt error:", e.message);
      return null;
    }
  }
  decrypt(b64) {
    try {
      const dec = CryptoJS.AES.decrypt(b64, this.key, this.cfg);
      return dec.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      console.log("❌ Decrypt error:", e.message);
      return null;
    }
  }
  async getConf() {
    console.log("⏳ Mengambil konfigurasi...");
    try {
      const enc = this.encrypt(JSON.stringify({
        packageName: "com.photoeditor.remakemefaceswapaigenerator"
      }));
      const res = await fetch(this.configUrl, {
        method: "POST",
        headers: {
          "User-Agent": "Dart/3.8 (dart:io)",
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip"
        },
        body: JSON.stringify({
          data: enc
        })
      });
      const json = await res.json();
      const dec = this.decrypt(json?.data);
      const config = dec ? JSON.parse(dec) : null;
      if (!config?.customConfig) {
        console.log("❌ Config custom tidak ditemukan");
        return false;
      }
      const customConf = config.customConfig;
      this.uploadUrl = customConf?.urlUploadIpFace;
      this.submitUrl = customConf?.urlPromptIpFaceAdapter;
      this.pollUrl = customConf?.urlGetResultByTaskId;
      this.baseConfig = customConf?.configIpFaceAdapter;
      if (!this.uploadUrl || !this.submitUrl || !this.pollUrl || !this.baseConfig) {
        console.log("❌ Config tidak lengkap. Yang diperlukan:");
        console.log("- uploadUrl:", this.uploadUrl);
        console.log("- submitUrl:", this.submitUrl);
        console.log("- pollUrl:", this.pollUrl);
        console.log("- baseConfig:", this.baseConfig ? "Ada" : "Tidak ada");
        return false;
      }
      console.log("✅ Konfigurasi berhasil diambil dan disiapkan.");
      console.log("📝 Config yang digunakan:");
      console.log("- Upload URL:", this.uploadUrl);
      console.log("- Submit URL:", this.submitUrl);
      console.log("- Poll URL:", this.pollUrl);
      return true;
    } catch (e) {
      console.log("❌ Config error:", e.message);
      return false;
    }
  }
  async downloadImage(imageUrl) {
    try {
      console.log(`📥 Downloading image from: ${imageUrl}`);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log(`✅ Downloaded ${buffer.length} bytes`);
      const contentType = response.headers.get("content-type");
      let fileExtension = "jpg";
      if (contentType) {
        if (contentType.includes("jpeg") || contentType.includes("jpg")) {
          fileExtension = "jpg";
        } else if (contentType.includes("png")) {
          fileExtension = "png";
        } else if (contentType.includes("gif")) {
          fileExtension = "gif";
        } else if (contentType.includes("webp")) {
          fileExtension = "webp";
        }
      }
      return {
        buffer: buffer,
        fileExtension: fileExtension,
        contentType: contentType
      };
    } catch (error) {
      console.log("❌ Download error:", error.message);
      return null;
    }
  }
  async up(imageUrl) {
    if (!imageUrl) {
      console.log("❌ imageUrl wajib diisi untuk Image-to-Image");
      return null;
    }
    if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
      console.log("ℹ️ imageUrl sudah berupa URL, perlu download terlebih dahulu...");
      const downloadResult = await this.downloadImage(imageUrl);
      if (!downloadResult) {
        console.log("❌ Download gambar gagal");
        return null;
      }
      const {
        buffer,
        fileExtension,
        contentType
      } = downloadResult;
      imageUrl = buffer;
    }
    let imageBuffer;
    if (imageUrl instanceof Buffer) {
      imageBuffer = imageUrl;
    } else if (typeof imageUrl === "string") {
      const base64Data = imageUrl.includes(",") ? imageUrl.split(",")[1] : imageUrl;
      try {
        imageBuffer = Buffer.from(base64Data || "", "base64");
      } catch (e) {
        console.log("❌ Error konversi base64 ke buffer:", e.message);
        return null;
      }
    } else {
      console.log("⚠️ Format imageUrl tidak didukung (harus URL, Base64 String, atau Buffer).");
      return null;
    }
    if (imageBuffer.length === 0) {
      console.log("❌ Buffer gambar kosong.");
      return null;
    }
    console.log(`⏳ Mengupload gambar (${imageBuffer.length} bytes)...`);
    let fileExtension = "jpg";
    let detectedContentType = "image/jpeg";
    if (imageBuffer.length >= 3) {
      if (imageBuffer[0] === 255 && imageBuffer[1] === 216 && imageBuffer[2] === 255) {
        fileExtension = "jpg";
        detectedContentType = "image/jpeg";
      } else if (imageBuffer[0] === 137 && imageBuffer[1] === 80 && imageBuffer[2] === 78) {
        fileExtension = "png";
        detectedContentType = "image/png";
      } else if (imageBuffer[0] === 71 && imageBuffer[1] === 73 && imageBuffer[2] === 70) {
        fileExtension = "gif";
        detectedContentType = "image/gif";
      } else if (imageBuffer[0] === 82 && imageBuffer[1] === 73 && imageBuffer[2] === 70) {
        fileExtension = "webp";
        detectedContentType = "image/webp";
      }
    }
    console.log(`📁 Detected file type: ${fileExtension}, Content-Type: ${detectedContentType}`);
    const fieldName = "image";
    let uploadSuccess = false;
    let uploadedUrl = null;
    console.log(`🔄 Mencoba upload dengan field name: ${fieldName}`);
    const form = new FormData();
    form.append(fieldName, imageBuffer, {
      filename: `image.${fileExtension}`,
      contentType: detectedContentType
    });
    form.append("no_resize", "1");
    try {
      const res = await fetch(this.uploadUrl, {
        method: "POST",
        headers: {
          "User-Agent": "Dart/3.8 (dart:io)",
          "Accept-Encoding": "gzip",
          ...form.getHeaders()
        },
        body: form
      });
      const text = await res.text();
      console.log(`📥 Upload response dengan ${fieldName}:`, text);
      if (text.startsWith("http")) {
        uploadedUrl = text;
        uploadSuccess = true;
      }
    } catch (e) {
      console.log(`❌ Upload error dengan ${fieldName}:`, e.message);
    }
    if (uploadSuccess) {
      console.log("✅ Upload sukses. URL:", uploadedUrl);
      return uploadedUrl;
    } else {
      console.log("❌ Upload gagal");
      return null;
    }
  }
  async sub(prompt, imageUrl, styleId) {
    if (!imageUrl) {
      console.log("❌ imageUrl wajib diisi untuk Image-to-Image");
      return null;
    }
    if (!styleId) {
      console.log("❌ styleId wajib diisi.");
      return null;
    }
    console.log(`⏳ Mengirim tugas Image-to-Image dengan style: ${styleId}...`);
    const config = JSON.parse(JSON.stringify(this.baseConfig));
    config.task.images = [{
      url: imageUrl
    }];
    if (config.task.methods[0]?.params?.["@replacements"]?.[0]) {
      config.task.methods[0].params["@replacements"][0].replacement = prompt || "a stunning photograph";
    }
    if (config.task.methods[0]?.params?.["@configId"] !== undefined) {
      config.task.methods[0].params["@configId"] = styleId;
      console.log("✅ @configId berhasil diubah menjadi:", styleId);
    } else {
      console.log("⚠️ Peringatan: @configId tidak ditemukan di baseConfig, tidak dapat mengubah style.");
    }
    try {
      const res = await fetch(this.submitUrl, {
        method: "POST",
        headers: {
          "User-Agent": "Dart/3.8 (dart:io)",
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip"
        },
        body: JSON.stringify(config)
      });
      const json = await res.json();
      console.log("📥 Response submit:", json);
      const taskId = json?.task?.requestId;
      if (taskId) {
        console.log("✅ Tugas berhasil dikirim. Task ID:", taskId);
        return taskId;
      } else {
        console.log("❌ Pengiriman tugas gagal. Pesan:", json?.task?.description || JSON.stringify(json));
        return null;
      }
    } catch (e) {
      console.log("❌ Submit error:", e.message);
      return null;
    }
  }
  async poll(taskId) {
    if (!taskId) {
      return {
        status: "ERROR",
        description: "Task ID tidak ada",
        resultUrl: null,
        isFinished: true
      };
    }
    const url = `${this.pollUrl}?request_id=${taskId}`;
    console.log(`🔍 Polling task: ${taskId}`);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Dart/3.8 (dart:io)",
          "Accept-Encoding": "gzip"
        }
      });
      const xmlText = await res.text();
      const $ = cheerio.load(xmlText, {
        xmlMode: true
      });
      const status = $("image_process_response > status").text();
      const resultUrl = $("image_process_response > result_url").text() || null;
      const description = $("image_process_response > description").text() || null;
      const upperStatus = status.toUpperCase();
      if (upperStatus === "OK" && resultUrl) {
        console.log("✅ Task selesai dengan sukses");
        return {
          status: "OK",
          description: description || "Success",
          resultUrl: resultUrl,
          isFinished: true
        };
      } else if (upperStatus === "INPROGRESS" || upperStatus === "PENDING") {
        console.log(`⏳ Status Task ${taskId}: ${status}. Menunggu...`);
        return {
          status: status,
          description: description || "In Progress",
          resultUrl: null,
          isFinished: false
        };
      } else {
        console.log(`❌ Task ${taskId} gagal. Status: ${status || "UNKNOWN"}.`);
        return {
          status: status || "FAILED",
          description: description || "Permanent Failure",
          resultUrl: null,
          isFinished: true
        };
      }
    } catch (e) {
      console.log("❌ Polling error:", e.message);
      return {
        status: "ERROR",
        description: `Polling API Error: ${e.message}`,
        resultUrl: null,
        isFinished: true
      };
    }
  }
  async generate({
    prompt = PROMPT.text,
    imageUrl,
    styleId = "ipadapter_cinematic_photo"
  }) {
    if (!prompt) {
      console.log("⚠️ Prompt wajib diisi.");
      return {
        status: "ERROR",
        resultUrl: null,
        taskId: null,
        description: "Prompt wajib diisi.",
        style: styleId
      };
    }
    if (!imageUrl) {
      console.log("⚠️ imageUrl wajib diisi untuk Image-to-Image.");
      return {
        status: "ERROR",
        resultUrl: null,
        taskId: null,
        description: "imageUrl wajib diisi untuk Image-to-Image.",
        style: styleId
      };
    }
    if (!this.baseConfig || !this.pollUrl) {
      const confReady = await this.getConf();
      if (!confReady) {
        return {
          status: "ERROR",
          resultUrl: null,
          taskId: null,
          description: "Gagal mengambil atau menyiapkan konfigurasi.",
          style: styleId
        };
      }
    }
    console.log(`\n=== Memulai Generasi Image-to-Image ===`);
    console.log(`📝 Prompt: ${prompt}`);
    console.log(`🖼️ Image: ${imageUrl}`);
    console.log(`🎨 Style: ${styleId}`);
    let uploadedUrl = await this.up(imageUrl);
    if (!uploadedUrl) {
      console.log("❌ Upload gambar gagal, tidak dapat melanjutkan.");
      return {
        status: "ERROR",
        resultUrl: null,
        taskId: null,
        description: "Gagal mengupload gambar.",
        style: styleId
      };
    }
    const taskId = await this.sub(prompt, uploadedUrl, styleId);
    if (!taskId) {
      return {
        status: "ERROR",
        resultUrl: null,
        taskId: null,
        description: "Gagal mengirimkan tugas submit (Periksa log sub).",
        style: styleId
      };
    }
    const intervalMs = 3e3;
    const maxAttempts = 30;
    console.log(`🔄 Memulai polling (${maxAttempts} attempts, ${intervalMs}ms interval)...`);
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`\n🔄 Polling attempt ${i + 1}/${maxAttempts}`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      const pollResult = await this.poll(taskId);
      if (pollResult.isFinished) {
        if (pollResult.status === "OK" && pollResult.resultUrl) {
          console.log("🎉 Generasi selesai!");
          return {
            status: "SUCCESS",
            resultUrl: pollResult.resultUrl,
            taskId: taskId,
            description: pollResult.description,
            style: styleId
          };
        } else {
          console.log("❌ Task gagal secara permanen.");
          return {
            status: "FAILED",
            resultUrl: null,
            taskId: taskId,
            description: pollResult.description || "Task gagal.",
            style: styleId
          };
        }
      }
    }
    console.log("❌ Polling gagal: Waktu habis (Timed out).");
    return {
      status: "TIMEOUT",
      resultUrl: null,
      taskId: taskId,
      description: "Waktu polling habis.",
      style: styleId
    };
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.imageUrl) {
    return res.status(400).json({
      error: "Input 'imageUrl' wajib diisi."
    });
  }
  try {
    const api = new AIClient();
    const response = await api.generate(params);
    return res.status(200).json(response);
  } catch (error) {
    console.error("Terjadi kesalahan pada API:", error);
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}