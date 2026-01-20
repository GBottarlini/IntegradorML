import express from "express";
import { mlRouter } from "./routes/ml.routes.js";
import { pool } from "./config/db.js";
import { skuRouter } from "./routes/sku.routes.js";
import { webhooksRouter } from "./routes/webhooks.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { tnRouter } from "./routes/tn.routes.js";

export const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.get("/ping", (_req, res) => res.json({ ok: true }));
app.get("/db/ping", async (_req, res) => {
  try {
    const { rows } = await pool.query("select now() as now");
    res.json({ ok: true, now: rows[0].now });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "DB_PING_FAILED",
      message: err.message,
    });
  }
});

app.use("/ml", mlRouter);

app.use("/skus", skuRouter);

app.use("/webhooks", webhooksRouter);

app.use("/auth", authRouter);

app.use("/tn", tnRouter);
