// Cabeçalhos de segurança aplicados a todas as respostas.
// A política de conteúdo (CSP) fica para uma etapa futura, pois exige ajuste fino.
export const securityHeaders = [
  // O navegador não "adivinha" o tipo de arquivo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ninguém pode colocar o sistema dentro de outro site (evita clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Ao sair para outro site, envia só o endereço base.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga recursos do aparelho que o sistema não usa.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Força HTTPS por 2 anos.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];
