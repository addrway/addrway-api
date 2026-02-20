import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json());

// ✅ CORS: allow only your site (set in DigitalOcean env)
// Example: https://addrway.github.io  OR your custom domain later
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server calls (no origin) and allow our site
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGIN === "*") return cb(null, true);
      if (origin === ALLOWED_ORIGIN) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
  })
);

// ✅ Rate limit: protects you from spam
// Adjust later per pricing tier.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ✅ API Key protection (set in DigitalOcean env)
const API_KEY = process.env.API_KEY;

// Health
app.get("/", (req, res) => {
  res.json({ ok: true, service: "addrway-api" });
});

// ✅ Middleware: require API key for protected routes
function requireApiKey(req, res, next) {
  // If you haven't set an API_KEY yet, allow temporarily (so you don’t lock yourself out).
  if (!API_KEY) return next();

  const key = req.header("x-api-key");
  if (!key || key !== API_KEY) {
    return res.status(401).json({ ok: false, error: "Invalid API key" });
  }
  next();
}

// ✅ fetch helper (works on Node 18+ OR falls back to node-fetch)
async function getFetch() {
  if (globalThis.fetch) return globalThis.fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

// ✅ Validate (protected) — FULL geocoding + components + lat/lon + TRUE confidence
app.post("/validate", requireApiKey, async (req, res) => {
  try {
    const address = (req.body?.address || "").trim();
    if (!address) {
      return res.status(400).json({ ok: false, error: "Missing address" });
    }

    const fetch = await getFetch();

    // ✅ Use jsonv2 + addressdetails for better structured response
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`;

    const geoRes = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Nominatim prefers a descriptive UA:
        "User-Agent": "addrway-api/1.0 (Addrway Address Validation)",
      },
    });

    if (!geoRes.ok) {
      return res.status(502).json({
        ok: false,
        error: "Geocoding provider error",
        status: geoRes.status,
      });
    }

    const data = await geoRes.json();

    // No match
    if (!Array.isArray(data) || data.length === 0) {
      return res.json({
        ok: true,
        valid: false,
        confidence: 0,
        input: address,
        normalized: "",
        components: {},
        lat: null,
        lon: null,
        source: "osm-nominatim",
      });
    }

    const best = data[0];
    const components = best.address || {};

    // ✅ Decide if it's a FULL address match (house # is critical)
    const hasHouse = !!components.house_number;
    const hasRoad  = !!components.road;
    const hasCity  = !!(components.city || components.town || components.village);
    const hasState = !!components.state;
    const hasZip   = !!components.postcode;

    const valid = hasHouse && hasRoad && hasCity && hasState && hasZip;

    // ✅ Confidence scoring (simple + predictable)
    // House # weighted highest because that's what makes it “whole address”
    let confidence = 0;
    if (hasHouse) confidence += 40;
    if (hasRoad)  confidence += 20;
    if (hasCity)  confidence += 15;
    if (hasState) confidence += 15;
    if (hasZip)   confidence += 10;
    confidence = Math.min(100, confidence);

    return res.json({
      ok: true,
      valid,
      confidence,
      input: address,
      normalized: best.display_name || address,
      components,
      lat: best.lat ? String(best.lat) : null,
      lon: best.lon ? String(best.lon) : null,
      source: "osm-nominatim",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("API running on", PORT));
