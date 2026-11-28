/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; object-src 'none'" },
      ],
    }];
  },
};

export default nextConfig;
