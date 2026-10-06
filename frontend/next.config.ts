import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '192.168.8.102',
    '192.168.8.102:3000',
    'localhost:3000',
    '127.0.0.1:3000'
  ],
};

export default nextConfig;
