import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ test route (you already saw this working)
app.get("/", (req, res) => {
  res.json({ ok: true, service: "addrway-api" });
});

// ✅ NEW: validate route
app.post("/validate", (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ ok: false, error: "address is required" });
  }

  // temporary “validation” until we connect real data/USPS
  const normalized = address.trim();
  const valid = normalized.length > 6;

  res.json({
    ok: true,
    input: address,
    normalized,
    valid
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("API running on", PORT));
