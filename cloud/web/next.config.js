/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output only for Docker builds
  ...(process.env.DOCKER_BUILD === 'true' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  // Ignore ESLint errors during build (for Vercel deployment)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ignore TypeScript errors during build (for Vercel deployment)
  typescript: {
    ignoreBuildErrors: true,
  },
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
