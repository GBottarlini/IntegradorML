// src/services/tiendanube.service.js
import axios from "axios";
import { env } from "../config/env.js";

const tn = axios.create({
  baseURL: `https://api.tiendanube.com/v1/${env.tiendaNubeStoreId}`,
  timeout: 20000,
});

function authHeaders() {
  if (!env.tiendaNubeStoreId) {
    throw new Error("TIENDA_NUBE_STORE_ID no configurado");
  }
  if (!env.tiendaNubeAccessToken) {
    throw new Error("TIENDA_NUBE_ACCESS_TOKEN no configurado");
  }
  return {
    "Authentication": `bearer ${env.tiendaNubeAccessToken}`,
    "User-Agent": "NationStockIntegrator (nacion.stock@gmail.com)",
  };
}

/**
 * Actualiza el stock de una variante de producto en TiendaNube.
 * @param {number} productId - El ID del producto.
 * @param {number} variantId - El ID de la variante.
 * @param {number} newStock - El nuevo valor del stock.
 */
export async function updateTnItemStock(productId, variantId, newStock) {
  const stock = Number(newStock);
  if (isNaN(stock) || stock < 0) {
    throw new Error("El nuevo stock debe ser un número válido mayor o igual a 0.");
  }

  console.log(`[TN Push] Actualizando stock para producto ${productId}, variante ${variantId} a ${stock}...`);

  try {
    const { data } = await tn.put(
      `/products/${productId}/variants/${variantId}`,
      { stock },
      { headers: authHeaders() }
    );
    console.log(`[TN Push] Stock para ${productId}/${variantId} actualizado correctamente.`);
    return data;
  } catch (error) {
    console.error(`[TN Push] Error actualizando stock para ${productId}/${variantId}:`, error?.response?.data || error.message);
    return { error: true, product_id: productId, variant_id: variantId, details: error?.response?.data || error.message };
  }
}

/**
 * Busca un producto por su SKU.
 * @param {string} sku - El SKU a buscar.
 */
export async function getProductBySku(sku) {
  if (!sku) {
    throw new Error("SKU es requerido.");
  }

  console.log(`[TN Fetch] Buscando producto con SKU: ${sku}`);

  try {
    // La API de Tienda Nube no parece tener un endpoint directo para buscar por SKU.
    // La estrategia es traer todos los productos y buscarlos en memoria.
    // Esto puede ser ineficiente para tiendas grandes.
    const products = await getAllProducts();
    for (const product of products) {
      if (product.variants) {
        for (const variant of product.variants) {
          if (variant.sku === sku) {
            console.log(`[TN Fetch] Encontrado producto ${product.id} para SKU ${sku}`);
            return product; // Devuelve el producto completo
          }
        }
      }
    }
    console.log(`[TN Fetch] No se encontró producto con SKU: ${sku}`);
    return null;
  } catch (error) {
    console.error(`[TN Fetch] Error buscando producto por SKU ${sku}:`, error?.response?.data || error.message);
    return { error: true, sku: sku, details: error?.response?.data || error.message };
  }
}

/**
 * Trae todos los productos de la tienda.
 */
export async function getAllProducts() {
  console.log(`[TN Fetch] Obteniendo todos los productos...`);
  let allProducts = [];
  let page = 1;
  const perPage = 200; // Maximo permitido por la API

  while (true) {
    try {
      const { data: products } = await tn.get("/products", {
        headers: authHeaders(),
        params: {
          page: page,
          per_page: perPage,
        },
      });

      if (!Array.isArray(products) || products.length === 0) {
        break; // No hay mas productos
      }

      allProducts = allProducts.concat(products);
      page++;
    } catch (error) {
      const status = error?.response?.status;
      const description = error?.response?.data?.description || "";

      if (status === 404 && description.includes("Last page is")) {
        break; // Se intento paginar mas alla del ultimo page
      }

      console.error(
        `[TN Fetch] Error obteniendo todos los productos:`,
        error?.response?.data || error.message
      );
      throw error;
    }
  }

  console.log(`[TN Fetch] Total de productos obtenidos: ${allProducts.length}`);
  return allProducts;
}

/**
 * Normaliza la estructura de un producto de TiendaNube a un formato estándar de variantes.
 * @param {object} product - El objeto de producto de la API de TiendaNube.
 * @returns {Array<object>} Una lista de variantes normalizadas.
 */
export function normalizeTnProduct(product) {
  const variants = [];

  if (!product || !product.id) {
    return variants;
  }

  // Si el producto tiene variantes, las procesamos.
  if (product.variants && product.variants.length > 0) {
    for (const variant of product.variants) {
      if (!variant.sku) continue; // Ignoramos variantes sin SKU

      variants.push({
        product_id: product.id,
        variant_id: variant.id,
        sku: variant.sku,
        stock_tn: variant.stock === null ? 0 : variant.stock, // TiendaNube usa null para stock ilimitado, lo tratamos como 0
        title: `${product.name.es} - ${variant.values.map(v => v.es).join(' ')}`,
        image_url: variant.image ? variant.image.src : (product.images.length > 0 ? product.images[0].src : null),
        price: variant.price,
      });
    }
  }
  // Si no tiene variantes, tratamos al producto principal como una.
  else if (product.sku) {
    variants.push({
      product_id: product.id,
      variant_id: product.id, // Usamos el mismo ID de producto como ID de variante
      sku: product.sku,
      stock_tn: product.stock === null ? 0 : product.stock,
      title: product.name.es,
      image_url: product.images.length > 0 ? product.images[0].src : null,
      price: product.price,
    });
  }

  return variants;
}
