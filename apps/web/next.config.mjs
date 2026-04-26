/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@app/shared', '@app/db', '@app/rag', '@app/agent'],
  serverExternalPackages: ['postgres'],
  webpack: (config) => {
    // Workspace packages are TS source written in NodeNext style
    // (`./foo.js` imports that resolve to `./foo.ts`). Teach webpack the
    // same alias so `transpilePackages` can bundle them.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
