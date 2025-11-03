import axios from "axios";
import PROXY from "@/configs/proxy-url";
const proxy = PROXY.url;
console.log("CORS proxy", proxy);
class BokepApi {
  constructor() {
    this.baseUrl = `${proxy}https://id.bokep.com/api`;
    this.headers = {
      accept: "*/*",
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      "content-type": "application/json",
      "front-version": "11.4.9",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: "https://id.bokep.com/",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"
    };
  }
  async _request({
    endpoint,
    params = {}
  }) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const config = {
        headers: this.headers,
        params: {
          uniq: Math.random().toString(36).substring(2, 15),
          ...params
        }
      };
      console.log(`🚀 Sending request to: ${url}`);
      const res = await axios.get(url, config);
      console.log(`✅ Request successful: ${res.status}`);
      return res.data || {};
    } catch (err) {
      console.error(`❌ Request failed: ${err.message} | Status: ${err.response?.status} | URL: ${err.config?.url}`);
      return err.response?.data || {
        error: err.message,
        status: err.response?.status
      };
    }
  }
  async search_suggestion({
    query,
    limit = 5,
    primaryTag = "girls"
  }) {
    return await this._request({
      endpoint: "/front/v4/models/search/suggestion",
      params: {
        query: query,
        limit: limit,
        primaryTag: primaryTag,
        rcmGrp: "A",
        oRcmGrp: "A"
      }
    });
  }
  async models({
    limit = 60,
    offset = 0,
    primaryTag = "girls",
    filterGroupTags = [
      ["ageTeen"]
    ],
    sortBy = "stripRanking",
    parentTag = "ageTeen"
  }) {
    return await this._request({
      endpoint: "/front/models",
      params: {
        limit: limit,
        offset: offset,
        primaryTag: primaryTag,
        sortBy: sortBy,
        parentTag: parentTag,
        filterGroupTags: JSON.stringify(filterGroupTags),
        removeShows: false,
        recInFeatured: false,
        nic: true,
        byw: false,
        rcmGrp: "A",
        rbCnGr: true,
        rbdCnGr: true,
        prxCnGr: true,
        iem: false,
        mvPrm: false
      }
    });
  }
  async live_tags({
    primaryTag = "girls",
    currentMixedTag = "ageTeen",
    parentTag = "ageTeen"
  }) {
    return await this._request({
      endpoint: "/front/models/liveTags",
      params: {
        primaryTag: primaryTag,
        withMixedTags: true,
        withEnhancedMixedTags: true,
        currentMixedTag: currentMixedTag,
        parentTag: parentTag
      }
    });
  }
  async broadcast({
    username
  }) {
    return await this._request({
      endpoint: `/front/v1/broadcasts/${username}`
    });
  }
  async model_cam({
    username,
    primaryTag = "girls"
  }) {
    return await this._request({
      endpoint: `/front/v2/models/username/${username}/cam`,
      params: {
        timezoneOffset: -480,
        triggerRequest: "loadCam",
        withEnhancedMixedTags: true,
        primaryTag: primaryTag
      }
    });
  }
  async model_chat({
    username
  }) {
    return await this._request({
      endpoint: `/front/v2/models/username/${username}/chat`,
      params: {
        source: "regular"
      }
    });
  }
  async related_models({
    username,
    limit = 60,
    primaryTag = "girls"
  }) {
    return await this._request({
      endpoint: `/front/models/username/${username}/related`,
      params: {
        limit: limit,
        offset: 0,
        primaryTag: primaryTag
      }
    });
  }
  async route_access({
    pathname
  }) {
    return await this._request({
      endpoint: "/front/route-access",
      params: {
        pathname: pathname
      }
    });
  }
  async model_apps({
    modelId
  }) {
    return await this._request({
      endpoint: `/front/models/${modelId}/apps`
    });
  }
}
const availableActions = {
  search_suggestion: ["query"],
  models: [],
  live_tags: [],
  broadcast: ["username"],
  model_cam: ["username"],
  model_chat: ["username"],
  related_models: ["username"],
  route_access: ["pathname"],
  model_apps: ["modelId"]
};
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Paramenter 'action' wajib diisi.",
      available_actions: Object.keys(availableActions)
    });
  }
  const api = new BokepApi();
  if (typeof api[action] !== "function") {
    return res.status(400).json({
      error: `Action tidak valid: '${action}'`,
      available_actions: Object.keys(availableActions)
    });
  }
  const requiredParams = availableActions[action];
  if (requiredParams) {
    for (const param of requiredParams) {
      if (!params[param]) {
        return res.status(400).json({
          error: `Paramenter '${param}' wajib untuk action '${action}'.`
        });
      }
    }
  }
  try {
    const result = await api[action](params);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({
      error: err.message || "Terjadi kesalahan pada server",
      action: action
    });
  }
}