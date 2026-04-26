/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // Workspace packages are bundled via transpilePackages.
  },
  transpilePackages: ['@app/shared', '@app/db', '@app/rag', '@app/agent'],
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
