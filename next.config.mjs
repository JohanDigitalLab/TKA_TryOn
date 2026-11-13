
/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // Jalankan pdf-parse melalui Node.js,
  // bukan melalui bundling internal Turbopack.
  serverExternalPackages: ["pdf-parse"],

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
