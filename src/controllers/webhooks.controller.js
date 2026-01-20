// src/controllers/webhooks.controller.js
import crypto from "crypto";
import { getSkuBySku, updateStock } from "../services/stock.service.js";
import { getOrderByResourceUrl } from "../services/mercadolibre.service.js";
import { env } from "../config/env.js";

async function getOrderData(resourceUrl) {
  try {
    return await getOrderByResourceUrl(resourceUrl);
  } catch (error) {
    console.error(
      `[ML Webhook] Error fetching order data from ${resourceUrl}:`,
      error?.response?.data || error.message
    );
    throw new Error("Could not fetch order data.");
  }
}

function safeCompareSignature(a, b) {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyTnWebhook(req) {
  const secret = env.tiendaNubeWebhookSecret || env.tiendaNubeClientSecret;
  if (!secret) {
    return { ok: true, skipped: true };
  }

  const signature = req.get("x-linkedstore-hmac-sha256");
  if (!signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return { ok: false, reason: "missing_raw_body" };
  }

  const expectedBase64 = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const ok =
    safeCompareSignature(signature, expectedBase64) ||
    safeCompareSignature(signature, expectedHex);

  return { ok, expectedBase64, expectedHex };
}

export async function handleMlWebhook(req, res) {
  const { body } = req;
  console.log("[ML Webhook] Notificacion recibida:", JSON.stringify(body, null, 2));

  // ML envia un ping de prueba al crear el webhook.
  if (body.topic === "test_topic") {
    console.log("[ML Webhook] Ping de prueba recibido y verificado.");
    return res.status(200).send("OK");
  }

  // Verificamos que sea una notificacion de orden
  if (body.topic !== "orders_v2") {
    console.log(`[ML Webhook] Ignorando topico '${body.topic}'.`);
    return res.status(200).send("OK, topic ignored");
  }

  // Respondemos 200 OK inmediatamente para evitar reintentos de ML.
  res.status(200).send("OK");

  // --- Procesamiento asincrono ---
  try {
    const order = await getOrderData(body.resource);
    console.log("[ML Webhook] Orden obtenida:", JSON.stringify(order, null, 2));

    if (order.status !== "paid") {
      console.log(`[ML Webhook] Ignorando orden con status '${order.status}'.`);
      return;
    }

    const orderItems = Array.isArray(order.order_items)
      ? order.order_items
      : [];

    for (const item of orderItems) {
      const sku = item?.item?.seller_sku;
      const quantitySold = item?.quantity;

      if (!sku) {
        console.warn(
          `[ML Webhook] Item ${item?.item?.id} en orden ${order.id} no tiene SKU. Ignorando.`
        );
        continue;
      }

      if (!Number.isFinite(quantitySold)) {
        console.warn(
          `[ML Webhook] Item ${item?.item?.id} en orden ${order.id} sin cantidad valida. Ignorando.`
        );
        continue;
      }

      console.log(`[ML Webhook] Procesando venta: ${quantitySold}x SKU ${sku}`);

      // 1. Obtener stock actual de nuestra DB
      const skuData = await getSkuBySku(sku);
      if (!skuData) {
        console.error(
          `[ML Webhook] SKU ${sku} de la venta no existe en nuestra base de datos. No se puede actualizar stock.`
        );
        continue;
      }
      const currentStock = skuData.stock;
      const newStock = currentStock - quantitySold;

      // 2. Actualizar stock en DB y propagar a las plataformas
      await updateStock({
        sku,
        stock: newStock,
        reason: "sale_ml",
        notes: `order_id:${order.id}`,
      });

      console.log(
        `[ML Webhook] Stock para SKU ${sku} actualizado de ${currentStock} a ${newStock}.`
      );
    }
  } catch (error) {
    console.error("[ML Webhook] Error procesando la notificacion de orden:", error);
    // El error ya fue logueado, no hacemos nada mas.
    // El webhook ya respondio 200, por lo que ML no reintentara.
  }
}

export async function handleTnWebhook(req, res) {
  const verification = verifyTnWebhook(req);
  if (!verification.ok) {
    console.warn(
      "[TN Webhook] Firma invalida:",
      verification.reason || "signature_mismatch"
    );
    return res.status(401).send("Invalid signature");
  }

  const { body: notification } = req;
  const event = req.get("x-tiendanube-event");

  console.log(
    `[TN Webhook] Notificacion recibida. Evento: '${event}'`,
    JSON.stringify(notification, null, 2)
  );

  // Respondemos 200 OK inmediatamente.
  res.status(200).send("OK");

  // --- Procesamiento asincrono ---
  if (event !== "order/paid") {
    console.log(`[TN Webhook] Ignorando evento '${event}'.`);
    return;
  }

  try {
    const order = notification; // El body es el objeto de la orden
    const products = Array.isArray(order?.products) ? order.products : [];

    console.log(`[TN Webhook] Procesando orden pagada ID: ${order.id}`);

    for (const product of products) {
      const sku = product?.sku;
      const quantitySold = product?.quantity;

      if (!sku) {
        console.warn(
          `[TN Webhook] Producto ${product?.product_id} en orden ${order.id} no tiene SKU. Ignorando.`
        );
        continue;
      }

      if (!Number.isFinite(quantitySold)) {
        console.warn(
          `[TN Webhook] Producto ${product?.product_id} en orden ${order.id} sin cantidad valida. Ignorando.`
        );
        continue;
      }

      console.log(`[TN Webhook] Procesando venta: ${quantitySold}x SKU ${sku}`);

      // 1. Obtener stock actual de nuestra DB
      const skuData = await getSkuBySku(sku);
      if (!skuData) {
        console.error(
          `[TN Webhook] SKU ${sku} de la venta no existe en nuestra base de datos. No se puede actualizar stock.`
        );
        continue;
      }
      const currentStock = skuData.stock;
      const newStock = currentStock - quantitySold;

      // 2. Actualizar stock en DB y propagar a las plataformas
      await updateStock({
        sku,
        stock: newStock,
        reason: "sale_tn",
        notes: `order_id:${order.id}`,
      });

      console.log(
        `[TN Webhook] Stock para SKU ${sku} actualizado de ${currentStock} a ${newStock}.`
      );
    }
  } catch (error) {
    console.error("[TN Webhook] Error procesando la notificacion de orden:", error);
  }
}
