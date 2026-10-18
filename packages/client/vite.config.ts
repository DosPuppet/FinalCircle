import { fileURLToPath } from "node:url";
import { createImageRelay } from "@finalcircle/server/imageRelay";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Card images in development: `/ffimg/` through the same serialized relay as the game server (never the browser to
 * the CDN), with a disk cache outside Git (`data/cache/images`).
 */
function imageRelay(): Plugin {
  const relay = createImageRelay({ cacheDir: fileURLToPath(new URL("../../data/cache/images", import.meta.url)) });
  return {
    name: "finalcircle-image-relay",
    configureServer(server) {
      server.middlewares.use("/ffimg", (req, res) => {
        void relay.get((req.url ?? "").split("?")[0] ?? "").then((r) => {
          res.statusCode = r.status;
          if (r.body) {
            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=86400");
          }
          res.end(r.body);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), imageRelay()],
  worker: { format: "es" },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // French catalogs, loaded at start-up: French is the default language.
            { name: "locales", test: /packages[\\/]\w+[\\/]locales[\\/]/ },
            { name: "cards", test: /packages[\\/]cards[\\/]data[\\/]/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      // Online play (lot A11): the /ws WebSocket goes to the game server.
      "/ws": { target: "ws://localhost:8788", ws: true },
    },
  },
});
