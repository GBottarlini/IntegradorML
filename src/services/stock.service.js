// src/services/stock.service.js
import { pool } from "../config/db.js";
import { updateMlItemStock } from "./mercadolibre.service.js";
import { updateTnItemStock } from "./tiendanube.service.js";

/**
 * Obtiene todos los SKUs de la base de datos.
 * @returns {Promise<Array>} Una lista de todos los SKUs con su informacion.
 */
export async function getAllSkus() {
  try {
    const { rows } = await pool.query(
      "SELECT sku, title, stock, image_url, updated_at FROM skus ORDER BY updated_at DESC"
    );
    return rows;
  } catch (error) {
    console.error("Error fetching all SKUs:", error);
    throw error;
  }
}

/**
 * Obtiene todos los SKUs con info de origen (ML/TN).
 * @returns {Promise<Array>} Una lista de SKUs con flags has_ml/has_tn.
 */
export async function getAllSkusWithSources() {
  try {
    const { rows } = await pool.query(
      `SELECT s.sku, s.title, s.stock, s.image_url, s.updated_at,
        EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku) AS has_ml,
        EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku) AS has_tn
       FROM skus s
       ORDER BY s.updated_at DESC`
    );
    return rows;
  } catch (error) {
    console.error("Error fetching SKUs with sources:", error);
    throw error;
  }
}

/**
 * Obtiene solo los SKUs vinculados en ML y TN.
 * @returns {Promise<Array>} Una lista de SKUs con has_ml/has_tn en true.
 */
export async function getLinkedSkus() {
  try {
    const { rows } = await pool.query(
      `SELECT s.sku, s.title, s.stock, s.image_url, s.updated_at,
        true AS has_ml,
        true AS has_tn
       FROM skus s
       WHERE EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku)
         AND EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku)
       ORDER BY s.updated_at DESC`
    );
    return rows;
  } catch (error) {
    console.error("Error fetching linked SKUs:", error);
    throw error;
  }
}

/**
 * Obtiene un SKU especifico por su identificador.
 * @param {string} sku - El SKU a obtener.
 * @returns {Promise<object>} El objeto del SKU.
 */
export async function getSkuBySku(sku) {
  try {
    const { rows } = await pool.query(
      "SELECT sku, title, stock, image_url, updated_at FROM skus WHERE sku = $1",
      [sku]
    );
    return rows[0];
  } catch (error) {
    console.error(`Error fetching SKU ${sku}:`, error);
    throw error;
  }
}

/**
 * Obtiene todos los item_id de MercadoLibre asociados a un SKU.
 * @param {string} sku
 * @returns {Promise<string[]>}
 */
async function getMlItemsBySku(sku) {
  try {
    const { rows } = await pool.query(
      "SELECT item_id FROM ml_items WHERE sku = $1",
      [sku]
    );
    return rows.map((r) => r.item_id);
  } catch (error) {
    console.error(`Error fetching ML items for SKU ${sku}:`, error);
    return []; // Devolvemos un array vacio para no detener el flujo principal.
  }
}

/**
 * Obtiene todos los product_id/variant_id de TiendaNube asociados a un SKU.
 * @param {string} sku
 * @returns {Promise<{product_id: number, variant_id: number}[]>}
 */
async function getTnItemsBySku(sku) {
  try {
    const { rows } = await pool.query(
      "SELECT product_id, variant_id FROM tn_items WHERE sku = $1",
      [sku]
    );
    return rows;
  } catch (error) {
    console.error(`Error fetching TN items for SKU ${sku}:`, error);
    return [];
  }
}

/**
 * Verifica si ya existe un movimiento de stock para un SKU y referencia.
 * @param {object} params
 * @param {string} params.sku
 * @param {string} params.reason
 * @param {string} params.ref
 * @returns {Promise<boolean>}
 */
async function hasStockLedgerEntry({ sku, reason, ref }) {
  if (!ref) return false;
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM stock_ledger WHERE sku = $1 AND reason = $2 AND ref = $3 LIMIT 1",
      [sku, reason, ref]
    );
    return rows.length > 0;
  } catch (error) {
    console.error(
      `Error checking stock ledger for SKU ${sku} (${reason}, ${ref}):`,
      error
    );
    return false;
  }
}

/**
 * Actualiza el stock para un SKU especifico, registra el movimiento y propaga el cambio.
 * @param {object} params
 * @param {string} params.sku - El SKU a actualizar.
 * @param {number} params.stock - El nuevo valor del stock.
 * @param {string} params.reason - La razon de la actualizacion (ej. 'manual_update', 'sale_ml', 'sale_tn').
 * @param {string} [params.notes] - Notas adicionales (ej. order_id).
 * @returns {Promise<object>} El SKU actualizado de la base de datos.
 */
export async function updateStock({ sku, stock, reason, notes = null }) {
  if (isNaN(stock) || stock < 0) {
    throw new Error("El stock debe ser un numero positivo.");
  }

  if (notes && (await hasStockLedgerEntry({ sku, reason, ref: notes }))) {
    console.log(
      `[Stock Sync] Movimiento ya registrado para ${sku} (${reason}, ${notes}).`
    );
    return getSkuBySku(sku);
  }

  const client = await pool.connect();
  let updatedSku;

  try {
    await client.query("BEGIN");

    const currentStockRes = await client.query(
      "SELECT stock FROM skus WHERE sku = $1 FOR UPDATE OF skus",
      [sku]
    );

    if (currentStockRes.rows.length === 0) {
      throw new Error(`El SKU '${sku}' no existe.`);
    }
    const oldStock = currentStockRes.rows[0].stock;
    const delta = stock - oldStock;

    const updatedSkuRes = await client.query(
      "UPDATE skus SET stock = $1, updated_at = now() WHERE sku = $2 RETURNING *",
      [stock, sku]
    );
    updatedSku = updatedSkuRes.rows[0];

    await client.query(
      "INSERT INTO stock_ledger (sku, delta, reason, ref) VALUES ($1, $2, $3, $4)",
      [sku, delta, reason, notes]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      console.warn(
        `[Stock Sync] Movimiento duplicado detectado para ${sku} (${reason}, ${notes}).`
      );
      return getSkuBySku(sku);
    }
    console.error(`Error al actualizar stock para ${sku} en DB:`, error);
    throw error; // Si falla la DB, no continuamos.
  } finally {
    client.release();
  }

  // --- Sincronizacion con plataformas (despues del commit) ---
  if (updatedSku) {
    console.log(
      `[Stock Sync] DB actualizada para ${sku}. Buscando items en plataformas para sincronizar...`
    );

    // Sincronizar con MercadoLibre
    const itemIdsToUpdateML = await getMlItemsBySku(sku);
    if (itemIdsToUpdateML.length > 0) {
      console.log(
        `[Stock Sync] Encontrados ${itemIdsToUpdateML.length} items de ML para SKU ${sku}. Actualizando stock a ${stock}...`
      );
      const updatePromisesML = itemIdsToUpdateML.map((itemId) =>
        updateMlItemStock(itemId, stock)
      );
      await Promise.all(updatePromisesML);
      console.log(
        `[Stock Sync] Proceso de actualizacion para SKU ${sku} en ML finalizado.`
      );
    } else {
      console.log(`[Stock Sync] No se encontraron items de ML para ${sku}.`);
    }

    // Sincronizar con TiendaNube
    const itemsToUpdateTN = await getTnItemsBySku(sku);
    if (itemsToUpdateTN.length > 0) {
      console.log(
        `[Stock Sync] Encontrados ${itemsToUpdateTN.length} items de TN para SKU ${sku}. Actualizando stock a ${stock}...`
      );
      const updatePromisesTN = itemsToUpdateTN.map(({ product_id, variant_id }) =>
        updateTnItemStock(product_id, variant_id, stock)
      );
      await Promise.all(updatePromisesTN);
      console.log(
        `[Stock Sync] Proceso de actualizacion para SKU ${sku} en TN finalizado.`
      );
    } else {
      console.log(`[Stock Sync] No se encontraron items de TN para ${sku}.`);
    }
  }

  return updatedSku;
}
