import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Izinkan akses dev server via IP publik / LAN (Next 16 blok by default).
  allowedDevOrigins: ["129.226.203.62", "localhost"],
};

export default nextConfig;
