import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "addrway-api" });
});

app.post("/validate", async (req, res) => {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: "address is required" });

  return res.json({
    input: address,
    standardized: address.trim(),
    deliverable: "unknown",
    source: "demo"
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Addrway API running on ${PORT}`));
