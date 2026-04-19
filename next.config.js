/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */

import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Move it here, as a top-level property
  allowedDevOrigins: [
    "http://localhost:4000",
    "http://localhost:3000",
    "http://192.168.1.231:4000",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:3000"
  ],
    webpack: (config, { isServer }) => {
    if (!isServer) {
       // Forces the HMR client to use the proxy's IP/Port
       config.output.hotUpdateMainFilename = 'static/webpack/[hash].hot-update.json';
       config.output.hotUpdateChunkFilename = 'static/webpack/[id].[hash].hot-update.js';
    }
    return config;
  },
};
export default config;
// /** @type {import("next").NextConfig} */
// const config = {};

// export default config;
