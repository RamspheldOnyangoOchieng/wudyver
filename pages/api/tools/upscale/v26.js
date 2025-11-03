// pages/api/upscale-webability.js

import axios from 'axios';

/**
 * Class untuk berinteraksi dengan API Upscale Gambar WebAbility.
 */
class WebAbilityUpscaler {
  /**
   * Mengonversi Buffer menjadi string Data URL.
   * @param {Buffer} buffer - Buffer gambar.
   * @returns {string} String Data URL (misal: "data:image/png;base64,...").
   * @private
   */
  _bufToDataUrl(buffer) {
    console.log("Mengonversi Buffer ke format Data URL...");
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  /**
   * Menginisialisasi gambar dari berbagai sumber dan mengembalikannya sebagai Data URL.
   * @param {string|Buffer} imageUrl - URL, string Base64, atau Buffer dari gambar.
   * @returns {Promise<string>} Promise yang resolve dengan string Data URL.
   * @private
   */
  async _initImage(imageUrl) {
    if (Buffer.isBuffer(imageUrl)) {
      console.log("Tipe masukan: Buffer");
      return this._bufToDataUrl(imageUrl);
    }
    
    if (imageUrl.startsWith('http')) {
      console.log("Tipe masukan: URL. Mengunduh gambar...");
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data, 'binary');
      return this._bufToDataUrl(imageBuffer);
    }

    console.log("Tipe masukan: diasumsikan Base64");
    if (imageUrl.startsWith('data:image')) {
      return imageUrl;
    }
    const buffer = Buffer.from(imageUrl, 'base64');
    return this._bufToDataUrl(buffer);
  }
  
  /**
   * Mengirim gambar ke API dan mengembalikan respons JSON asli dari API tersebut.
   *
   * @param {object} params - Parameter untuk pembuatan gambar.
   * @param {string|Buffer} params.imageUrl - URL, string Base64, atau Buffer dari gambar.
   * @param {number|string} [params.scale=2] - Faktor upscale.
   * @param {string} [params.model='esrgan'] - Model AI yang digunakan.
   * @returns {Promise<object>} Promise yang resolve dengan objek JSON asli dari API.
   */
  async generate({ imageUrl, ...rest }) {
    console.log("Proses 'generate' WebAbility dimulai...");
    try {
      const imageDataUrl = await this._initImage(imageUrl);
      
      const payload = {
        image: imageDataUrl,
        scale: rest.scale?.toString() || "2",
        model: rest.model || "esrgan",
        mode: rest.mode || "photo"
      };

      const headers = {
        'accept': '*/*',
        'accept-language': 'id-ID',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'origin': 'https://www.webability.io',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://www.webability.io/tools/ai-image-upscaler',
        'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36'
      };

      console.log("Mengirim permintaan ke API WebAbility...");
      const response = await axios.post('https://www.webability.io/api/upscale-image', payload, { headers });
      
      console.log("Berhasil menerima respons dari API. Mengembalikan JSON asli.");
      
      // PERUBAHAN: Langsung kembalikan data JSON dari respons
      const result = response.data;
      
      if (result.success) {
        return result;
      } else {
        const message = result.error || "API merespons dengan status gagal.";
        throw new Error(message);
      }

    } catch (error) {
      console.error("Terjadi kesalahan di dalam class WebAbility:", error.message);
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
    const api = new WebAbilityUpscaler();
    // Hasilnya sekarang adalah objek JSON, bukan buffer
    const apiResult = await api.generate(params);

    // PERUBAHAN: Kirim respons JSON asli yang diterima
    return res.status(200).json(apiResult);

  } catch (error) {
    console.error("Kesalahan saat memproses permintaan:", error);
    return res.status(500).json({
      error: error.message || "Kesalahan Internal Server"
    });
  }
}