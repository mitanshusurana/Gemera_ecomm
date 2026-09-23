/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Both suppressions removed: the project now typechecks clean. On a UI that
  // renders GST figures, a hidden type error is a route to a wrong number on
  // an invoice.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: process.env.INTERNAL_BACKEND_URL || 'http://erp-backend:8000/api/v1/:path*',
      },
    ];
  },
}

module.exports = nextConfig
