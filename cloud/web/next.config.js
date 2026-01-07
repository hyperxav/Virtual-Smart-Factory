/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Allow API calls to different origins in development
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/api/:path*',
            destination: `${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/:path*`,
          },
        ]
      : [];
  },
};

module.exports = nextConfig;
