/**
 * pm2 configuration of the FinalCircle server (see docs/deployment.md).
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save
 * The server listens locally only: nginx publishes it over HTTPS. Port 8788: Planecircle uses 8787 on the same VPS.
 */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "finalcircle",
      cwd: path.join(__dirname, ".."),
      // Server compiled by "npm run build:server" (a single file: engine, cards and ws included; neither tsx nor
      // node_modules at run time), with its AI worker next to it.
      script: "packages/server/dist/main.mjs",
      interpreter: "node",
      // Young generation of the heap capped: under load, V8 otherwise keeps hundreds of MB unused (tools/load-test.ts).
      interpreter_args: "--max-semi-space-size=8 --max-old-space-size=512",
      env: {
        NODE_ENV: "production",
        PORT: 8788,
        HOST: "127.0.0.1",
        // Optional:
        // FC_DECISION_MS: 60000, // time per decision
        // FC_GRACE_MS: 60000,    // time allowed to come back after a disconnection
        // FC_MAX_ROOMS: 200,     // most rooms open at once
        // FC_MAX_HEAP_MB: 384,   // heap beyond which no room is created (before max_memory_restart)
        // FC_AI_WORKERS: 2,      // workers of the online AI seats (0: no online AI)
        // FC_MAX_AI_ROOMS: 12,   // most rooms with an AI open at once
        // FC_MAX_RSS_MB: 640,    // RSS (workers included) beyond which no room with an AI is created
        // FC_IMAGES_DIR: "data/images", // images the official CDN lacks (tools/missing-images.ts)
      },
      autorestart: true,
      // A room takes about 0.2 MB of heap; the server refuses new rooms beyond FC_MAX_HEAP_MB, well before this limit
      // (otherwise pm2 would restart the server in a loop).
      max_memory_restart: "768M",
      time: true,
    },
  ],
};
