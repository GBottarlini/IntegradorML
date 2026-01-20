
import "dotenv/config";
import { syncTnItemsToDb } from "./src/services/syncTnToDb.service.js";

async function testSync() {
  console.log('Iniciando prueba de sincronización de Tienda Nube...');
  try {
    const result = await syncTnItemsToDb();
    console.log('Sincronización completada con éxito.');
    console.log('Resultado:', result);
  } catch (error) {
    console.error('Error durante la prueba de sincronización:', error);
  }
}

testSync();
