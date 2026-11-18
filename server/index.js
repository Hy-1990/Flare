import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4317);
const { app, queue } = await createApp({
  root,
  port,
  dir: process.env.FLARE_DATA_DIR || path.join(root, ".flare"),
  dev: process.argv.includes("--dev"),
});
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Flare is ready: http://127.0.0.1:${port}`);
  queue.pump();
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Set PORT to another number and try again.`
      : "Could not start the local server.",
  );
  process.exit(1);
});
