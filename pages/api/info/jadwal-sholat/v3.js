import axios from "axios";
import * as cheerio from "cheerio";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
class IslamicFinder {
  constructor() {
    console.log("[Init] Creating axios instance with cookie jar");
    const jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: jar
    }));
    this.base = "https://www.islamicfinder.org";
    this.headers = {
      "accept-language": "id-ID",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"'
    };
  }
  async search({
    city,
    ...rest
  }) {
    console.log(`[Search] Looking for city: ${city}`);
    try {
      const {
        data
      } = await this.client.get(`${this.base}/world/global-search`, {
        params: {
          cityOnly: 1,
          keyword: city,
          ...rest
        },
        headers: {
          ...this.headers,
          accept: "application/json, text/javascript, */*; q=0.01",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      console.log(`[Search] Found ${data?.length || 0} results`);
      return data || [];
    } catch (err) {
      console.error("[Search] Error:", err?.message || err);
      return [];
    }
  }
  async geo({
    lat,
    lng,
    city,
    country,
    state,
    iso
  }) {
    console.log(`[Geo] Geocoding: ${city}, ${state}, ${country}`);
    try {
      const tz = this.tz(new Date().getTimezoneOffset());
      const {
        data
      } = await this.client.get(`${this.base}/world/geocode-location`, {
        params: {
          city: city,
          country: country,
          timezone: tz,
          subdivision: state,
          countryIso: iso,
          lng: lng,
          lat: lat
        },
        headers: this.headers
      });
      console.log("[Geo] Geocode complete");
      return data;
    } catch (err) {
      console.error("[Geo] Error:", err?.message || err);
      return null;
    }
  }
  async get({
    id,
    slug,
    country,
    lang = "id"
  }) {
    console.log(`[Get] Fetching prayer times for ID: ${id}`);
    try {
      const cSlug = country?.toLowerCase()?.replace(/\s+/g, "-")?.replace(/[^a-z0-9-]/g, "") || "indonesia";
      const url = `${this.base}/world/${cSlug}/${id}/${slug}-prayer-times/`;
      const {
        data: html
      } = await this.client.get(url, {
        params: {
          language: lang
        },
        headers: {
          ...this.headers,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      console.log("[Get] Parsing HTML");
      return this.parse(html);
    } catch (err) {
      console.error("[Get] Error:", err?.message || err);
      return null;
    }
  }
  parse(html) {
    const $ = cheerio.load(html);
    const card = $("#prayertimes-card");
    const loc = card.find(".boxCard-title")?.text()?.trim()?.replace(/jadwal sholat di\s*/i, "") || null;
    const date = card.find(".pt-date p").first()?.text()?.trim() || null;
    const hijri = card.find(".pt-date-right")?.text()?.trim() || null;
    const times = {};
    card.find(".prayerTiles").each((i, el) => {
      const name = $(el).find(".prayername")?.text()?.trim()?.split("\n")[0] || null;
      const time = $(el).find(".prayertime")?.text()?.trim() || null;
      if (name && time) {
        const key = this.key(name);
        times[key] = time;
      }
    });
    const method = card.find(".pt-info p").first()?.text()?.trim() || null;
    const calc = card.find(".pt-info p").last()?.text()?.trim() || null;
    console.log(`[Parse] Extracted times for: ${loc || "Unknown"}`);
    return {
      location: loc,
      date: date,
      hijriDate: hijri,
      prayerTimes: times,
      method: method,
      calculation: calc
    };
  }
  key(name) {
    const map = {
      subuh: "fajr",
      "matahari terbit": "sunrise",
      dzuhur: "dhuhr",
      ashar: "asr",
      magrib: "maghrib",
      isya: "isha"
    };
    return map[name?.toLowerCase()] || name?.toLowerCase()?.replace(/\s+/g, "_");
  }
  tz(offset) {
    const hrs = Math.abs(offset / 60);
    const sign = offset > 0 ? "-" : "+";
    return `${sign}${hrs.toString().padStart(2, "0")}:00`;
  }
  async find({
    city,
    country = "Indonesia"
  }) {
    console.log(`[Find] Starting search for: ${city}, ${country}`);
    const results = await this.search({
      city: city
    });
    if (!results?.length) {
      console.log("[Find] No results found");
      return null;
    }
    const match = results.find(r => r?.countryName?.toLowerCase() === country?.toLowerCase()) || results[0];
    if (!match) {
      console.log("[Find] No matching location");
      return null;
    }
    console.log(`[Find] Matched: ${match.title} (ID: ${match.id})`);
    return this.get({
      id: match.id,
      slug: match.slug || match.title?.toLowerCase()?.replace(/\s+/g, "-")?.replace(/[^a-z0-9-]/g, ""),
      country: match.countryName
    });
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.city) {
    return res.status(400).json({
      error: "city are required"
    });
  }
  try {
    const api = new IslamicFinder();
    const response = await api.search(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}