/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'supabase.co'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  transpilePackages: ['@tuition/shared'],
};

const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');
module.exports = phase => ({
  ...nextConfig,
  // A production build must not replace assets served by the running dev server.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});
