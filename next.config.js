/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@reservoir0x/relay-kit-ui',
    '@reservoir0x/relay-kit-hooks',
    '@reservoir0x/relay-sdk',
    '@reservoir0x/relay-bitcoin-wallet-adapter',
    '@reservoir0x/relay-solana-wallet-adapter'
  ]
}

module.exports = nextConfig
