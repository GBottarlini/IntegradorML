import { Router } from "express";
import { getItem, normalizeItem, searchMyItems } from "../services/mercadolibre.service.js";
import { syncMlItemsToDb } from "../services/syncMlToDb.service.js";


export const mlRouter = Router();

// Health simple
mlRouter.get("/ping", (_req, res) => {
  res.json({ ok: true, service: "ml" });
});

// Lista items normalizados (SKU + imagen + stock)
mlRouter.get("/items", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const itemIds = await searchMyItems(limit);

    // Traemos en paralelo pero sin volvernos locos
    const items = await Promise.all(itemIds.map((id) => getItem(id)));
    const normalized = items.map(normalizeItem);

    // Opcional: filtrar los que no tienen sku
    const onlyWithSku = normalized.filter((x) => x.sku);

    res.json({
      total: normalized.length,
      with_sku: onlyWithSku.length,
      items: onlyWithSku,
    });
  } catch (err) {
    res.status(500).json({
      error: "ML_ITEMS_FETCH_FAILED",
      message: err?.response?.data?.message || err.message,
      details: err?.response?.data || null,
    });
  }
});

mlRouter.post("/sync-to-db", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const result = await syncMlItemsToDb({ mode: "partial", limit });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "ML_SYNC_DB_FAILED",
      message: err?.response?.data?.message || err.message,
      details: err?.response?.data || null,
    });
  }
});

mlRouter.post("/sync-all-to-db", async (req, res) => {
  try {
    const result = await syncMlItemsToDb(); // ahora sync trae todo
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "ML_SYNC_ALL_DB_FAILED",
      message: err?.response?.data?.message || err.message,
      details: err?.response?.data || null,
    });
  }
});
