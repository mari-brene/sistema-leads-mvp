# Sistema Leads MVP — regras do projeto

CRM de prospecção e relacionamento comercial: Kanban de leads, importação de CSV, busca de empresas, campanhas de WhatsApp e autoresponder com IA com transferência para humano.

Direção atual: evoluir para uma plataforma **multi-clientes** para a agência Krescer (organização com clientes isolados entre si). Veja `docs/HANDOFF.md`, se existir.

## Como trabalhar com a usuária (inegociável)

- Ela NÃO é programadora (Windows, PowerShell, escreve em português do Brasil). Explique tudo em português simples, diga exatamente onde clicar e o que digitar, e peça confirmação antes de qualquer ação irreversível.
- Em todo passo no PowerShell, diga se é para fechar o PowerShell antigo ou abrir um novo, e em qual pasta.
- Trabalhe em partes/fases pequenas. Ao fim de cada uma: rodar testes e typecheck, explicar o teste manual em passos numerados e PARAR até ela escrever exatamente "fase aprovada".
- Nunca peça chaves coladas no chat. Avise sobre prints que mostrem segredos.
- Só planos gratuitos, sem cartão de crédito (Groq/Gemini, OpenStreetMap, Supabase, Vercel).
- Comentários no código: não são necessários por enquanto.

## Comandos

- `npm run dev` liga o sistema em http://localhost:3000
- `npm test` testes (Vitest) · `npm run typecheck` · `npm run lint` · `npm run build`

## Stack

Next.js 15 (App Router) + React 19 + TypeScript estrito + Tailwind. Hospedagem: **Vercel**. Banco/login: Supabase (`DATA_BACKEND=file|supabase`). IA: Groq/Gemini. Busca: OpenStreetMap. Agendador: GitHub Actions chamando `/api/cron/*` com `CRON_SECRET` (comparação em tempo constante). Fuso de negócio: America/Sao_Paulo.

## Como o código está organizado

- `src/app` telas e rotas · `src/components` componentes · `src/lib` regras de negócio, cada área com repositório + adaptadores.
- Padrão repositório/adaptador: toda integração externa tem versão real e versão FAKE (`MOCK_MODE=true` roda tudo sem chave).
- Configuração lida só em `src/lib/config.ts`. Variáveis documentadas em `.env.example`.
- Cabeçalhos de segurança em `security-headers.mjs` (testados).

## Regras que não podem ser quebradas

- WhatsApp: só caminhos oficiais. API oficial da Meta (templates aprovados fora da janela de 24h) ou o link manual `wa.me` ("Abrir no WhatsApp", a pessoa envia). Proibido WhatsApp Web automatizado, Baileys, Puppeteer/Playwright.
- Marketing só para contatos com `opt_in`, registrando data e origem. Respeitar SAIR/PARAR/CANCELAR (`opt_out`, nunca mais enviar).
- Leads vindos de busca de empresas entram em "Prospecção" e NUNCA entram em campanha automática.
- Instagram: nada de curtir, seguir, ver stories ou comentar automaticamente. Só responder DMs recebidas (API oficial) e sugestões aprovadas manualmente.
- Nunca registrar chaves no código ou em logs. Tudo em variáveis de ambiente.
- Não versionar arquivos `.zip` nem `.env*` (exceto `.env.example`).
- Dados de um cliente nunca podem aparecer para outro cliente (regra central da fase multi-clientes).

## Decisões já tomadas

- Hospedagem: Vercel.
- WhatsApp: um número por cliente (proposta, aguardando confirmação).
- Papéis propostos: administrador da agência, gestor do cliente, atendente (aguardando confirmação).

## Perguntas em aberto

- Confirmar papéis de usuário e WhatsApp por cliente.
- Instagram fica fora do escopo da plataforma multi-clientes?
- Quem é o "Marco" que revisa o desenho?

## Fases do MVP

1 base+auth · 2 leads+Kanban · 3 CSV · 4 busca · 5 campanhas · 6 inbox+IA · 7 agendador · 8 WhatsApp (API aguardando verificação da Meta; botão manual pronto) · 9 painel · 10 Instagram (opcional).
