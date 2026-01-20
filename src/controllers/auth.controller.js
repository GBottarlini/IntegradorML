// src/controllers/auth.controller.js
import axios from "axios";
import { env } from "../config/env.js";

const TN_CLIENT_ID = env.tiendaNubeClientId;
const TN_CLIENT_SECRET = env.tiendaNubeClientSecret;
const TN_REDIRECT_URI = env.tiendaNubeRedirectUri;

function ensureTnAuthConfig(res) {
  if (!TN_CLIENT_ID || !TN_CLIENT_SECRET || !TN_REDIRECT_URI) {
    res
      .status(500)
      .send(
        "<h1>Error de configuracion</h1><p>Faltan TIENDA_NUBE_CLIENT_ID, TIENDA_NUBE_CLIENT_SECRET o TIENDA_NUBE_REDIRECT_URI en el .env.</p>"
      );
    return false;
  }
  return true;
}

/**
 * Redirige al usuario a la pantalla de autorizacion de Tienda Nube.
 */
export function initiateTnAuth(req, res) {
  if (!ensureTnAuthConfig(res)) return;
  const authUrl = `https://www.tiendanube.com/apps/${TN_CLIENT_ID}/authorize`;
  console.log(`[Auth TN] Redirigiendo a: ${authUrl}`);
  res.redirect(authUrl);
}

/**
 * Maneja el callback de Tienda Nube, intercambia el codigo por un token
 * y muestra las credenciales al usuario.
 */
export async function handleTnAuthCallback(req, res) {
  if (!ensureTnAuthConfig(res)) return;
  const { code } = req.query;

  if (!code) {
    return res
      .status(400)
      .send(
        "<h1>Error: No se recibio el codigo de autorizacion.</h1><p>Por favor, intenta el proceso de nuevo.</p>"
      );
  }

  console.log(`[Auth TN] Codigo de autorizacion recibido: ${code}`);
  console.log("[Auth TN] Intercambiando codigo por access_token...");

  try {
    const tokenUrl = "https://www.tiendanube.com/apps/authorize/token";

    // Los parametros deben enviarse en el cuerpo (data) con el formato application/x-www-form-urlencoded
    const bodyParams = new URLSearchParams();
    bodyParams.append("client_id", TN_CLIENT_ID);
    bodyParams.append("client_secret", TN_CLIENT_SECRET);
    bodyParams.append("grant_type", "authorization_code");
    bodyParams.append("code", code);
    bodyParams.append("redirect_uri", TN_REDIRECT_URI);

    const { data } = await axios.post(tokenUrl, bodyParams);

    const { access_token, user_id: store_id } = data;

    console.log("[Auth TN] Token y Store ID obtenidos con exito!");

    res.send(`
      <html>
        <head>
          <title>Credenciales Tienda Nube</title>
          <style>
            body { font-family: sans-serif; padding: 2em; background-color: #f9f9f9; }
            .container { background-color: white; padding: 2em; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); max-width: 800px; margin: auto; }
            h1 { color: #333; }
            p { font-size: 1.1em; }
            code { background-color: #eee; padding: 0.5em; border-radius: 4px; font-family: monospace; font-size: 1.2em; display: block; white-space: pre-wrap; word-break: break-all; margin-top: 1em; }
            .env-block { margin-top: 2em; }
            .warning { color: #d9534f; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Credenciales de Tienda Nube obtenidas!</h1>
            <p>El proceso de autorizacion fue exitoso.</p>
            <p class="warning">Copia estas variables en tu archivo <code>.env</code> para que la aplicacion pueda conectarse a tu tienda.</p>

            <div class="env-block">
              <p><strong>Access Token:</strong></p>
              <code>TIENDA_NUBE_ACCESS_TOKEN=${access_token}</code>

              <p style="margin-top: 1.5em;"><strong>Store ID:</strong></p>
              <code>TIENDA_NUBE_STORE_ID=${store_id}</code>
            </div>

            <p style="margin-top: 2em;">Una vez que hayas guardado estas variables, reinicia el servidor de la aplicacion.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(
      "[Auth TN] Error obteniendo el access token:",
      error?.response?.data || error.message
    );
    res
      .status(500)
      .send(
        "<h1>Error al obtener el token</h1><p>No se pudo completar la autenticacion. Revisa la consola para mas detalles.</p>"
      );
  }
}
