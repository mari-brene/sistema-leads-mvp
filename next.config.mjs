/**
 * Cabeçalhos de segurança enviados em todas as páginas.
 * Ficam em um arquivo à parte (security-headers.mjs) para poderem ser testados.
 */
import { securityHeaders } from "./security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Não anuncia "X-Powered-By: Next.js" (menos pistas para quem procura falhas).
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
