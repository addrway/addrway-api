import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json());

// ✅ CORS
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGIN === "*") return cb(null, true);
      if (origin === ALLOWED_ORIGIN) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
  })
);

// ✅ Rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ✅ API Key
const API_KEY = process.env.API_KEY;

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, service: "addrway-api" });
});

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();

  const key = req.header("x-api-key");
  if (!key || key !== API_KEY) {
    return res.status(401).json({ ok: false, error: "Invalid API key" });
  }
  next();
}

// Fetch helper
async function getFetch() {
  if (globalThis.fetch) return globalThis.fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

// ✅ VALIDATE ROUTE
app.post("/validate", requireApiKey, async (req, res) => {
  try {
    const address = (req.body?.address || "").trim();
    if (!address) {
      return res.status(400).json({ ok: false, error: "Missing address" });
    }

    const fetch = await getFetch();

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`;

    const geoRes = await fetch(url, {
      headers: {
        Accept: "application/json",
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

    // ✅ Component checks
    const hasHouse = !!components.house_number;
    const hasRoad  = !!components.road;
    const hasCity  = !!(components.city || components.town || components.village);
    const hasState = !!components.state;
    const hasZip   = !!components.postcode;

    // ✅ Strict full-address validity
    const valid = hasHouse && hasRoad && hasCity && hasState && hasZip;

    // ✅ Confidence scoring
    let confidence = 0;
    if (hasHouse) confidence += 40;
    if (hasRoad)  confidence += 20;
    if (hasCity)  confidence += 15;
    if (hasState) confidence += 15;
    if (hasZip)   confidence += 10;

    // ✅ ZIP mismatch penalty
    const userZipMatch = address.match(/\b\d{5}\b/);
    const userZip = userZipMatch ? userZipMatch[0] : null;

    if (userZip && components.postcode && userZip !== components.postcode) {
      confidence = Math.max(0, confidence - 25);
    }

    return res.json({
      ok: true,
      valid,
      confidence,
      input: address,
      normalized: best.display_name || address,
      components,
      lat: best.lat || null,
      lon: best.lon || null,
      source: "osm-nominatim",
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("API running on", PORT));
