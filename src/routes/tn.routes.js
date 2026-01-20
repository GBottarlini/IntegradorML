// src/routes/tn.routes.js
import { Router } from "express";
import { syncTnItemsToDb } from "../services/syncTnToDb.service.js";

const tnRouter = Router();

// Endpoint para sincronizar los productos de TiendaNube a la base de datos local
tnRouter.get("/sync-to-db", async (_req, res) => {
  try {
    console.log("[TN Sync] Iniciando sincronización de Tienda Nube...");
    // No esperamos a que termine para no causar un timeout en el request.
    // El proceso corre en background.
    syncTnItemsToDb().catch(err => {
      console.error("[TN Sync] Error durante la sincronización en background:", err);
    });

    res.status(202).json({
      ok: true,
      message: "Proceso de sincronización de Tienda Nube iniciado. Esto puede tardar varios minutos.",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "TN_SYNC_FAILED",
      message: error.message,
    });
  }
});

export { tnRouter };
