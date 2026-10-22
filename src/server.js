require("dotenv").config();

const { createApp } = require("./app");
const { initDatabase, bootstrapAdmin } = require("./db");

async function main() {
  await initDatabase();
  await bootstrapAdmin();

  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Secure API Portal listening on port ${port}`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});
