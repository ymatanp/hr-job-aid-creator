/** @type {import('next').NextConfig} */
const nextConfig = {
  // pptx-automizer, sharp, ffmpeg-static and the Anthropic SDK must run on the
  // Node runtime, never bundled into the client. Keep them external on the server.
  experimental: {
    // Keep native/server-only libs out of the client bundle (Next 14.2 location).
    serverComponentsExternalPackages: ['pptx-automizer', 'sharp', 'ffmpeg-static', '@anthropic-ai/sdk'],
  },
};

export default nextConfig;
