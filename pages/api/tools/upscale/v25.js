// pages/api/upscale.js

import axios from 'axios';
import FormData from 'form-data';

/**
 * Class untuk berinteraksi dengan API Upscale Gambar Mooniverse.
 */
class Mooniverse {
  /**
   * Mengonversi string Base64 menjadi Buffer.
   * @param {string} base64 - String data Base64.
   * @returns {Buffer} Buffer dari data gambar.
   * @private
   */
  _b64tobuf(base64) {
    console.log("Mengonversi Base64 ke Buffer...");
    return Buffer.from(base64, 'base64');
  }

  /**
   * Menginisialisasi buffer gambar dari berbagai jenis sumber.
   * @param {string|Buffer} imageUrl - URL, string Base64, atau Buffer dari gambar.
   * @returns {Promise<{imageBuffer: Buffer, filename: string}>} Objek berisi buffer dan nama file.
   * @private
   */
  async _initImage(imageUrl) {
    if (Buffer.isBuffer(imageUrl)) {
      console.log("Tipe masukan: Buffer");
      return { imageBuffer: imageUrl, filename: 'image.png' };
    }
    
    if (imageUrl.startsWith('http')) {
      console.log("Tipe masukan: URL. Mengunduh gambar...");
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data, 'binary');
      const filename = imageUrl.split('/').pop() || 'image.png';
      return { imageBuffer, filename };
    }

    console.log("Tipe masukan: diasumsikan Base64");
    return { imageBuffer: this._b64tobuf(imageUrl), filename: 'image.png' };
  }
  
  /**
   * Memproses gambar, mengirimkannya ke API, dan mengembalikan buffer gambar yang sudah di-upscale.
   *
   * @param {object} params - Parameter untuk pembuatan gambar.
   * @param {string|Buffer} params.imageUrl - URL, string Base64, atau Buffer dari gambar.
   * @param {number} [params.scale=2] - Faktor upscale.
   * @returns {Promise<Buffer>} Promise yang resolve dengan Buffer gambar hasil upscale.
   */
  async generate({ imageUrl, ...rest }) {
    console.log("Proses 'generate' dimulai...");
    try {
      const { imageBuffer, filename } = await this._initImage(imageUrl);
      
      const form = new FormData();
      const scale = rest.scale || 2;

      form.append('files', imageBuffer, { filename });
      form.append('scale', scale.toString());

      console.log(`Mengirim permintaan ke API dengan skala ${scale}x...`);

      // PERUBAHAN: Menyesuaikan header sesuai dengan cURL
      const headers = {
        ...form.getHeaders(), // Penting untuk content-type multipart/form-data
        'accept': '*/*',
        'accept-language': 'id-ID',
        'cache-control': 'no-cache',
        'origin': 'https://mooniverse.dev',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://mooniverse.dev/Image/UpscaleImage',
        'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36'
      };
      
      const response = await axios.post('https://mooniverse.dev/Image/UpscaleImages', form, { headers });
      
      console.log("Berhasil menerima respons dari API.");
      const result = response.data?.files?.[0] || {};
      
      if (result.success && result.data) {
        return this._b64tobuf(result.data);
      } else {
        const message = result.error || "API tidak mengembalikan data gambar yang valid.";
        throw new Error(message);
      }

    } catch (error) {
      console.error("Terjadi kesalahan di dalam class:", error.message);
      const errorMessage = error.response?.data?.error || error.message;
      throw new Error(errorMessage);
    }
  }
}

/**
 * Handler untuk API route Next.js.
 */
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;

  if (!params.imageUrl) {
    return res.status(400).json({
      error: "Parameter 'imageUrl' diperlukan"
    });
  }

  try {
    const api = new Mooniverse();
    const finalImageBuffer = await api.generate(params);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', finalImageBuffer.length);
    
    return res.status(200).send(finalImageBuffer);

  } catch (error) {
    console.error("Kesalahan saat memproses permintaan:", error);
    return res.status(500).json({
      error: error.message || "Kesalahan Internal Server"
    });
  }
}