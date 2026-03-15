import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import generateInvoice from "./invoiceGenerator.js";

const app = express();
app.use(express.json());
app.use("/invoices", express.static("invoices"));

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

// ✅ Temporary in-memory customer counter
let customerCounter = 0;

// ✅ Temporary in-memory customer records
// NOTE: This is temporary. If the server restarts, data resets.
// Later we should store this in a real database.
const customerStore = new Map();

/*
customerStore example:
{
  "AW-000001": {
    customerId: "AW-000001",
    plan: "starter",
    used: 42,
    limit: 5000,
    createdAt: "2026-03-14T12:00:00.000Z"
  }
}
*/

function normalizePlan(plan) {
  return String(plan || "").toLowerCase() === "starter" ? "starter" : "basic";
}

function getPlanLimit(plan) {
  return normalizePlan(plan) === "starter" ? 5000 : 1000;
}

function formatPlanName(plan) {
  return normalizePlan(plan) === "starter" ? "Starter" : "Basic";
}

function getOrCreateCustomerRecord(customerId) {
  if (!customerStore.has(customerId)) {
    const defaultPlan = "basic";
    customerStore.set(customerId, {
      customerId,
      plan: defaultPlan,
      used: 0,
      limit: getPlanLimit(defaultPlan),
      createdAt: new Date().toISOString(),
    });
  }

  const record = customerStore.get(customerId);
  record.plan = normalizePlan(record.plan);
  record.limit = getPlanLimit(record.plan);

  return record;
}

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, service: "addrway-api" });
});

// ✅ Create new sequential customer ID
app.post("/create-customer-id", (req, res) => {
  try {
    customerCounter += 1;

    const customerId = `AW-${String(customerCounter).padStart(6, "0")}`;

    // ✅ create default customer record
    const defaultPlan = "basic";
    customerStore.set(customerId, {
      customerId,
      plan: defaultPlan,
      used: 0,
      limit: getPlanLimit(defaultPlan),
      createdAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      customerId,
      counter: customerCounter,
      plan: formatPlanName(defaultPlan),
      used: 0,
      limit: getPlanLimit(defaultPlan),
    });
  } catch (error) {
    console.error("Customer ID error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to create customer ID",
    });
  }
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

// ✅ Get customer usage + plan
app.get("/customer/:customerId", (req, res) => {
  try {
    const customerId = String(req.params.customerId || "").trim();

    if (!customerId) {
      return res.status(400).json({
        ok: false,
        error: "Missing customer ID",
      });
    }

    const record = getOrCreateCustomerRecord(customerId);

    return res.json({
      ok: true,
      customerId: record.customerId,
      plan: formatPlanName(record.plan),
      used: record.used,
      limit: record.limit,
      createdAt: record.createdAt,
    });
  } catch (error) {
    console.error("Customer fetch error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch customer data",
    });
  }
});

// ✅ Set customer plan
app.post("/set-plan", (req, res) => {
  try {
    const { customerId, plan } = req.body || {};

    if (!customerId || !plan) {
      return res.status(400).json({
        ok: false,
        error: "Missing customerId or plan",
      });
    }

    const record = getOrCreateCustomerRecord(String(customerId).trim());
    record.plan = normalizePlan(plan);
    record.limit = getPlanLimit(record.plan);

    return res.json({
      ok: true,
      customerId: record.customerId,
      plan: formatPlanName(record.plan),
      used: record.used,
      limit: record.limit,
    });
  } catch (error) {
    console.error("Set plan error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to update customer plan",
    });
  }
});

// ✅ Reset monthly usage for a customer (temporary helper)
app.post("/reset-usage", (req, res) => {
  try {
    const { customerId } = req.body || {};

    if (!customerId) {
      return res.status(400).json({
        ok: false,
        error: "Missing customerId",
      });
    }

    const record = getOrCreateCustomerRecord(String(customerId).trim());
    record.used = 0;

    return res.json({
      ok: true,
      customerId: record.customerId,
      plan: formatPlanName(record.plan),
      used: record.used,
      limit: record.limit,
    });
  } catch (error) {
    console.error("Reset usage error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to reset usage",
    });
  }
});

// ✅ VALIDATE ROUTE WITH PLAN CAP ENFORCEMENT
app.post("/validate", requireApiKey, async (req, res) => {
  try {
    const address = (req.body?.address || "").trim();
    const customerId = String(req.header("x-customer-id") || "").trim();

    if (!customerId) {
      return res.status(400).json({
        ok: false,
        error: "Missing customer ID",
      });
    }

    if (!address) {
      return res.status(400).json({
        ok: false,
        error: "Missing address",
      });
    }

    const customer = getOrCreateCustomerRecord(customerId);

    // ✅ block lookup if customer reached cap
    if (customer.used >= customer.limit) {
      return res.status(403).json({
        ok: false,
        error: "Monthly validation cap reached",
        customerId: customer.customerId,
        plan: formatPlanName(customer.plan),
        used: customer.used,
        limit: customer.limit,
      });
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

    // ✅ count the lookup attempt
    customer.used += 1;

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
        usage: {
          customerId: customer.customerId,
          plan: formatPlanName(customer.plan),
          used: customer.used,
          limit: customer.limit,
          remaining: Math.max(customer.limit - customer.used, 0),
        },
      });
    }

    const best = data[0];
    const components = best.address || {};

    const hasHouse = !!components.house_number;
    const hasRoad = !!components.road;
    const hasCity = !!(components.city || components.town || components.village);
    const hasState = !!components.state;
    const hasZip = !!components.postcode;

    const valid = hasHouse && hasRoad && hasCity && hasState && hasZip;

    let confidence = 0;
    if (hasHouse) confidence += 40;
    if (hasRoad) confidence += 20;
    if (hasCity) confidence += 15;
    if (hasState) confidence += 15;
    if (hasZip) confidence += 10;

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
      usage: {
        customerId: customer.customerId,
        plan: formatPlanName(customer.plan),
        used: customer.used,
        limit: customer.limit,
        remaining: Math.max(customer.limit - customer.used, 0),
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: "Server error",
    });
  }
});

// ✅ GENERATE INVOICE PDF ROUTE
app.post("/generate-invoice", async (req, res) => {
  try {
    const {
      accountId,
      orderId,
      planId,
      planName,
      unitCost,
      subtotal,
      tax,
      total,
    } = req.body || {};

    if (!accountId || !orderId || !planId || !planName) {
      return res.status(400).json({
        ok: false,
        error: "Missing required invoice fields",
      });
    }

    const fileName = await generateInvoice({
      accountId,
      orderId,
      planId,
      planName,
      unitCost: unitCost ?? "0.00",
      subtotal: subtotal ?? "0.00",
      tax: tax ?? "0.00",
      total: total ?? "0.00",
    });

    return res.json({
      ok: true,
      pdf: `/invoices/${fileName}`,
      fileName,
    });
  } catch (error) {
    console.error("Invoice error:", error);

    return res.status(500).json({
      ok: false,
      error: "Invoice generation failed",
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("API running on", PORT));
