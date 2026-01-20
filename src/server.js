import { app } from "./app.js";
import { env } from "./config/env.js";
import { startJobs } from "./jobs/sync-ml-items.job.js";

app.listen(env.port, () => {
  console.log(`Integrador corriendo en http://localhost:${env.port}`);
});

if (env.enableCron) {
  startJobs();
} else {
  console.log("Cron jobs disabled. Set ENABLE_CRON=true to enable.");
}
