// src/routes/webhooks.routes.js
import { Router } from "express";
import { handleMlWebhook, handleTnWebhook } from "../controllers/webhooks.controller.js";

const webhooksRouter = Router();

// Endpoint para notificaciones de Mercado Libre
webhooksRouter.post("/ml", handleMlWebhook);

// Endpoint para notificaciones de Tienda Nube
webhooksRouter.post("/tn", handleTnWebhook);

export { webhooksRouter };
