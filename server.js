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
  // If you haven't set an API_KEY yet, we allow temporarily (so you don’t lock yourself out).
  // Once you set it in DigitalOcean, it becomes enforced automatically.
  if (!API_KEY) return next();

  const key = req.header("x-api-key");
  if (!key || key !== API_KEY) {
    return res.status(401).json({ ok: false, error: "Invalid API key" });
  }
  next();
}

// ✅ Validate (protected)
app.post("/validate", requireApiKey, async (req, res) => {
  try {
    const address = (req.body?.address || "").trim();
    if (!address) {
      return res.status(400).json({ ok: false, error: "Missing address" });
    }

    // For now: your current working logic (OSM/Nominatim style)
    // If you already added the enhanced response (lat/lon/components/confidence),
    // keep that logic here and just leave the protection above.
    // ---- Example minimal response fallback:
    const normalized = address;
    const valid = normalized.length > 6;

    return res.json({
      valid,
      confidence: valid ? 100 : 0,
      normalized,
      source: "demo",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("API running on", PORT));
