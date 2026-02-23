const nextConfig = {
  reactStrictMode: false,
  webpack(config) {
    config.module.rules.push({
      test: /\.html$/,
      type: 'asset/source'
    });
    return config;
  }
};

export default nextConfig;
