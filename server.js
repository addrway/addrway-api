import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// health check
app.get("/", (req, res) => res.json({ ok: true, service: "addrway-api" }));
app.get("/health", (req, res) => res.json({ ok: true }));

function scoreFromComponents(c = {}) {
  // Basic “full address” scoring
  const hasHouse = !!c.house_number;
  const hasRoad = !!c.road;
  const hasCity = !!(c.city || c.town || c.village);
  const hasState = !!c.state;
  const hasZip = !!c.postcode;

  let score = 0;
  if (hasHouse) score += 30;
  if (hasRoad) score += 25;
  if (hasCity) score += 20;
  if (hasState) score += 15;
  if (hasZip) score += 10;

  const valid = hasHouse && hasRoad && hasCity && hasState; // “whole address” threshold
  return { score, valid };
}

app.post("/validate", async (req, res) => {
  const { address } = req.body || {};
  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "Missing address string" });
  }

  try {
    // Nominatim search (address -> best match)
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`;

    const r = await fetch(url, {
      headers: {
        "Accept": "application/json",
        // Nominatim expects an identifying UA (keep it simple)
        "User-Agent": "Addrway/1.0 (contact: support@addrway.com)"
      }
    });

    const data = await r.json();

    if (!data || data.length === 0) {
      return res.json({
        valid: false,
        confidence: 0,
        normalized: address,
        components: {},
        message: "No match found"
      });
    }

    const best = data[0];
    const components = best.address || {};
    const normalized = best.display_name || address;

    const { score, valid } = scoreFromComponents(components);

    return res.json({
      valid,
      confidence: score,          // 0–100
      normalized,                 // pretty normalized string
      components,                 // contains house_number, road, city, state, postcode, etc.
      lat: best.lat,
      lon: best.lon,
      source: "osm-nominatim"
    });
  } catch (err) {
    return res.status(500).json({ error: "Validation failed", details: String(err) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Addrway API running on ${PORT}`));
