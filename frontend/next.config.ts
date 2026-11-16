import type { NextConfig } from 'next';

// Where the browser's /api calls go in development. In production Nginx routes /api and
// /socket.io to the API, so these rewrites are only a fallback.
const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@smart-reply/shared'],
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }
        ]
      }
    ];
  }
};

export default nextConfig;
