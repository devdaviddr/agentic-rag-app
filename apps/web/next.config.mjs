/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@app/shared', '@app/db', '@app/rag', '@app/agent'],
  serverExternalPackages: ['postgres', '@napi-rs/canvas', 'unpdf'],
  webpack: (config, { isServer }) => {
    // Workspace packages are TS source written in NodeNext style
    // (`./foo.js` imports that resolve to `./foo.ts`). Teach webpack the
    // same alias so `transpilePackages` can bundle them.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    if (isServer) {
      // @napi-rs/canvas pulls in a native .node binary that webpack can't
      // bundle. unpdf's pdfjs subpath dynamically imports the full pdfjs
      // build at runtime — let Node resolve both natively.
      const externals = Array.isArray(config.externals)
        ? config.externals
        : [config.externals].filter(Boolean);
      config.externals = [
        ...externals,
        ({ request }, callback) => {
          if (
            request === '@napi-rs/canvas' ||
            request?.startsWith('@napi-rs/canvas/') ||
            request === 'unpdf' ||
            request?.startsWith('unpdf/')
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
