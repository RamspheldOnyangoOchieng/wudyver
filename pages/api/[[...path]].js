import axios from "axios";
import apiConfig from "@/configs/apiConfig";
const OPENAPI_URL = `https://${apiConfig.DOMAIN_URL}/api/openapi`;
async function fetchOpenAPIRoutes() {
  try {
    const response = await axios.get(OPENAPI_URL, {
      timeout: 3e3
    });
    const spec = response.data;
    const paths = spec.paths ? Object.keys(spec.paths) : [];
    const routes = paths.map(p => `${p}`);
    return routes;
  } catch (error) {
    console.error("Axios/OpenAPI fetch error:", error.message);
    return [];
  }
}
export default async function handler(req, res) {
  const pathSegments = req.query.path || [];
  const requestedPath = pathSegments.join("/");
  let availableRoutes = [];
  try {
    availableRoutes = await fetchOpenAPIRoutes();
    const message = `API Route /${requestedPath} (method ${req.method}) tidak ditemukan.`;
    const body = {
      success: false,
      status: 404,
      code: `ROUTE_NOT_FOUND`,
      message: message,
      method: req.method,
      path: req.url,
      timestamp: new Date().toISOString(),
      availableRoutes: availableRoutes
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(404).json(body);
  } catch (error) {
    console.error("Internal Server Error while processing 404:", error);
    return res.status(500).json({
      success: false,
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal error during 404 processing."
    });
  }
}