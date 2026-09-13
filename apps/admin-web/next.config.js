/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@secure-exam/api-client', '@secure-exam/types'],
};

module.exports = nextConfig;
