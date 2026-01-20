import { Router } from "express";
import {
  getAllSkus,
  getAllSkusWithSources,
  getLinkedSkus,
  updateStock,
} from "../services/stock.service.js";

export const skuRouter = Router();

// Endpoint para listar todos los SKUs y su stock maestro
skuRouter.get("/", async (req, res) => {
  try {
    const skus = await getAllSkus();
    res.json(skus);
  } catch (err) {
    res.status(500).json({
      error: "SKU_FETCH_FAILED",
      message: err.message,
    });
  }
});

// Endpoint para listar SKUs con origen (ML/TN)
skuRouter.get("/with-sources", async (req, res) => {
  try {
    const skus = await getAllSkusWithSources();
    res.json(skus);
  } catch (err) {
    res.status(500).json({
      error: "SKU_FETCH_FAILED",
      message: err.message,
    });
  }
});

// Endpoint para listar SKUs vinculados en ML y TN
skuRouter.get("/linked", async (req, res) => {
  try {
    const skus = await getLinkedSkus();
    res.json(skus);
  } catch (err) {
    res.status(500).json({
      error: "SKU_FETCH_FAILED",
      message: err.message,
    });
  }
});

// Endpoint para actualizar el stock de un SKU específico
skuRouter.put("/:sku/stock", async (req, res) => {
  const { sku } = req.params;
  const { stock } = req.body;

  if (typeof stock !== "number") {
    return res.status(400).json({
      error: "INVALID_PAYLOAD",
      message: "El campo 'stock' es requerido y debe ser un número.",
    });
  }

  try {
    const updatedSku = await updateStock({
      sku,
      stock,
      reason: "manual_update",
    });
    res.json(updatedSku);
  } catch (err) {
    res.status(500).json({
      error: "SKU_UPDATE_FAILED",
      message: err.message,
    });
  }
});
