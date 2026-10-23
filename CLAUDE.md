# Sistema Leads MVP — regras do projeto

Plataforma de prospecção e relacionamento comercial (Kanban de leads, campanhas de WhatsApp, autoresponder com IA).
A usuária NÃO é programadora: explique cada passo em português simples, diga exatamente o que clicar/digitar e peça confirmação antes de qualquer ação irreversível.

## Regras de conformidade (inegociáveis)

- WhatsApp SOMENTE pela WhatsApp Cloud API oficial da Meta. Proibido WhatsApp Web, Baileys, Puppeteer/Playwright em WhatsApp ou Instagram.
- Mensagem de marketing só para contatos com `opt_in = true`, registrando data e origem. Respeitar palavras de saída (SAIR, PARAR, CANCELAR): marcar `opt_out` e nunca mais enviar.
- Fora da janela de 24h, só templates aprovados.
- Leads vindos de busca de empresas entram como "Prospecção" e NUNCA entram em campanha automática.
- Instagram: NÃO implementar curtir, seguir, ver stories ou comentar automaticamente. Apenas responder DMs recebidas (API oficial) e gerar sugestões que a usuária aprova manualmente.
- Nunca registrar chaves no código ou em logs. Tudo em variáveis de ambiente.

## Stack

Next.js (App Router) + TypeScript + Tailwind; Supabase (Postgres + Auth + RLS) a partir da fase de contas reais; IA via Groq/Gemini (planos gratuitos, sem cartão); busca de empresas via OpenStreetMap (Overpass); WhatsApp Cloud API; rotinas agendadas por GitHub Actions chamando `/api/cron/*` protegidas por `CRON_SECRET` (comparação em tempo constante). Fuso de negócio: America/Sao_Paulo.

## Modo simulação

Toda integração externa tem um adaptador real e um adaptador FAKE, escolhido por `MOCK_MODE=true`. Com `MOCK_MODE=true` o sistema inteiro funciona sem nenhuma chave.

## Fases

1 base+auth+layout · 2 leads+Kanban · 3 CSV · 4 busca de empresas · 5 campanhas+fila · 6 inbox+autoresponder · 7 agendador+GitHub Actions · 8 WhatsApp real · 9 painel · 10 Instagram (opcional).
Ao fim de cada fase: rodar lint, typecheck e testes, explicar o teste manual em passos numerados e PARAR até a usuária escrever "fase aprovada".
