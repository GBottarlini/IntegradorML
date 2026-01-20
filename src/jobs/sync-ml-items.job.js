// src/jobs/sync-ml-items.job.js
import cron from "node-cron";
import { env } from "../config/env.js";
import { syncMlItemsToDb } from "../services/syncMlToDb.service.js";
import { syncTnItemsToDb } from "../services/syncTnToDb.service.js";

const mlCron = env.mlSyncCron || "0 * * * *";
const tnCron = env.tnSyncCron || "30 */6 * * *";

const syncMlItemsJob = cron.schedule(
  mlCron,
  async () => {
    console.log("Running scheduled job: Syncing Mercado Libre items to DB...");
    try {
      await syncMlItemsToDb();
      console.log("Scheduled job finished: Syncing Mercado Libre items to DB.");
    } catch (error) {
      console.error(
        "Error running scheduled job: Syncing Mercado Libre items to DB",
        error
      );
    }
  },
  { scheduled: false }
);

const syncTnItemsJob = cron.schedule(
  tnCron,
  async () => {
    console.log("Running scheduled job: Syncing Tienda Nube items to DB...");
    try {
      await syncTnItemsToDb();
      console.log("Scheduled job finished: Syncing Tienda Nube items to DB.");
    } catch (error) {
      console.error(
        "Error running scheduled job: Syncing Tienda Nube items to DB",
        error
      );
    }
  },
  { scheduled: false }
);

export const startJobs = () => {
  syncMlItemsJob.start();
  syncTnItemsJob.start();
  console.log("Cron jobs started.");
};
