# Sistema Leads MVP — regras do projeto (rascunho para a equipe ajustar)

CRM de uso interno da Krescer (agência de marketing). Kanban de leads, importação CSV, prospecção de empresas, campanhas de WhatsApp e caixa de entrada com autoresponder de IA que passa para uma pessoa quando necessário.

Este arquivo foi escrito a partir do que o código já faz e das decisões do Marco em 11/11/2026. Onde houver dúvida, está em "Perguntas em aberto". Contexto completo e ordem de trabalho: `docs/HANDOFF.md`.

## Escopo decidido
- **Uso interno da Krescer**, sem venda de assinatura, marketplace ou SDK.
- **Organização com clientes isolados**, no modelo do MCC do Google Ads e do BM da Meta: a Krescer é a organização, cada cliente tem seus dados separados, e usuários da agência podem ter acesso a vários clientes. Um cliente nunca pode ver dados de outro.
- **Canal único: WhatsApp** (Cloud API oficial da Meta). E-mail, SMS, VoIP e chat ao vivo no site estão fora do escopo.
- Os 6 recursos exclusivos Krescer entram no escopo: hierarquia organização → clientes, orçamento vertical, converter orçamento em venda, lead PF/PJ, endereço completo do lead e rastreamento UTM + GCLID/FBCLID/TTCLID.
- O que fazer e em que ordem está no **Backlog CRM SMKT** no Notion (link em `docs/HANDOFF.md`). Atualize a coluna "Situação no código" ao concluir um item.

## Comandos
- `npm install`
- `npm run dev` (http://localhost:3000). Crie `.env.local` a partir de `.env.example` e defina `SESSION_SECRET`.
- `npm test` (Vitest), `npm run lint`, `npm run typecheck`, `npm run build`
- Antes de abrir um pull request, `test`, `lint`, `typecheck` e `build` precisam passar.

## Como o código está organizado
- Next.js 15 (App Router), React 19, TypeScript e Tailwind. Node 20 ou mais novo.
- `src/lib/` guarda as regras de negócio. Os arquivos `types.ts` são "puros" (sem `fs` nem `crypto`) porque também rodam no navegador. Mantenha assim.
- Todo acesso a dados passa por `src/lib/storage` (`readJson` e `writeJson`). `DATA_BACKEND=file` (padrão) grava em `.data/`; `DATA_BACKEND=supabase` usa a tabela `app_data` com controle de versão.
- Provedores trocáveis por variável de ambiente, com simulação como padrão: `MOCK_MODE`, `AI_PROVIDER` (mock, groq, gemini), `WHATSAPP_PROVIDER` (mock, cloud), `PLACES_PROVIDER` (mock, osm).
- Textos de tela e mensagens de erro em português do Brasil.
- Todo código novo vem com teste em `tests/`.

## Regras que não podem ser quebradas
- **Marketing só para contatos com opt-in.** Respeitar o opt-out (SAIR). Toda mensagem de marketing leva a frase de saída com a palavra "SAIR".
- **Janela de 24h do WhatsApp:** fora dela só vale modelo aprovado pela Meta, enviado por campanha.
- **Nenhuma mensagem real sai em simulação.** Com `MOCK_MODE=true` ou `WHATSAPP_PROVIDER` diferente de `cloud`, o envio é simulado.
- **Auditoria guarda só contagens e avisos.** Nunca nomes, telefones, mensagens ou chaves.
- **Segredos nunca entram no código, no git nem em logs.** `.env*` fica fora do git. A chave secreta do Supabase (`SUPABASE_SECRET_KEY`) nunca vai para o navegador.
- **Rotas protegidas falham fechadas:** `/api/cron/*` exige `CRON_SECRET`, e o webhook da Meta exige o token de verificação e a assinatura (`META_APP_SECRET`). Sem a configuração, respondem com erro.
- **Telefones em E.164** (`src/lib/phone.ts`).
- **Isolamento por cliente:** toda leitura e gravação do que for novo deve carregar o cliente. Nunca consultar dados sem filtrar por ele.

## Perguntas em aberto (responder e apagar daqui)
1. **Hospedagem:** o código cita a Vercel numa proteção de `src/lib/storage/index.ts`. A hospedagem ainda não foi definida?
2. **Comentários no código:** o repositório vem sendo limpo de comentários. Qual é a regra, nenhum comentário ou só os que explicam o porquê?
3. **Papéis de usuário:** quais papéis existem (por exemplo, administrador da agência, gestor do cliente, atendente)?
4. **Número de WhatsApp:** cada cliente terá o próprio número e a própria conta na Meta? Isso define como o webhook identifica o cliente.
