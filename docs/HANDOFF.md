# Passagem de contexto — Krescer CRM SMKT

Escrito em 11/11/2026 para quem vai continuar o desenvolvimento com o Claude Code. Este arquivo substitui a necessidade de ler o chat onde o escopo foi definido.

## 1. O que decidimos (Marco)
- Uso interno da Krescer. Organização com **clientes isolados**, como o MCC do Google Ads e o BM da Meta.
- Somente **WhatsApp**.
- Os 6 recursos exclusivos Krescer entram no escopo (hierarquia organização → clientes, orçamento vertical, converter orçamento em venda, lead PF/PJ, endereço completo, UTM + GCLID/FBCLID/TTCLID).
- Sem cobrança de assinatura, marketplace, SDK nem suporte por chat.

## 2. Onde está cada coisa
- Código: https://github.com/mari-brene/sistema-leads-mvp
- Notion do projeto novo: https://app.notion.com/p/4156477ad49d816fa169ca3c4c0eef02
- **Backlog CRM SMKT** (fonte do que fazer): https://app.notion.com/p/4fa6477ad49d82a08b9f01590936be58
  - 96 itens. Decisão: 25 MVP, 28 Fase 2, 33 Fase 3, 10 fora do escopo. Situação no código: 5 Pronto, 11 Parcial, 77 Falta, 3 A verificar.
- O comparativo com o Kommo, dentro da página, é **só referência de escopo**. Ele descreve outro sistema; os status dele não valem para este código. A página original ("SaaS CRM SMKT") deve ficar intacta.

## 3. Estado do código (auditoria de 11/11/2026)
- **Funciona e tem testes:** kanban, lista de leads com busca e filtros, importação CSV, prospecção de empresas, campanhas com modelos, caixa de entrada com IA e bloqueio fora da janela de 24h, webhook da Meta, envio pela Cloud API, agendador e auditoria. 305 testes, `typecheck`, `lint` e `build` passam.
- **Tudo roda em simulação** (`MOCK_MODE=true`). Nada foi testado com Supabase, WhatsApp ou IA reais.
- **`/painel` é tela provisória.**
- **Não existe ainda:** papéis de usuário e equipes, noção de cliente, exportação de leads, tarefas e lembretes, campos personalizados, UTM/GCLID, PF/PJ e endereço no lead, status entregue/lido do WhatsApp, respostas rápidas, formulário web, API REST, webhooks de saída. Etapas do funil são 6 fixas.
- **Problemas encontrados:**
  1. `next@15.5.27` com alerta crítico (execução remota de código no otimizador de imagens com SVG) e um de alta gravidade (negação de serviço em Server Actions). `npm audit` aponta 15 vulnerabilidades; as de `vitest` e `vite` afetam só o desenvolvimento.
  2. Nenhum header de segurança nas respostas.
  3. `.env.example` sem `SUPABASE_*`, `DATA_BACKEND`, `AI_PROVIDER`, `GROQ_*`, `GEMINI_*`, `PLACES_PROVIDER`, `OSM_CONTACT` e `CRON_SECRET`. README com 4 linhas. `fase2-atualizacao.zip` e `fase3-atualizacao.zip` versionados.
  4. Cada coleção é uma linha `jsonb` na tabela `app_data`; gravações simultâneas dão erro de conflito.
  5. Dados separados só por usuário. Credenciais do WhatsApp são variáveis de ambiente globais.

## 4. Ordem sugerida de trabalho
1. **Base, sem depender de decisão:** atualizar o Next; adicionar headers de segurança; completar `.env.example`, README e `CLAUDE.md`; tirar os `.zip` do git.
2. **Desenhar antes de codar o multi-cliente.** Peça ao Claude Code um plano (modelo de dados organização → cliente → usuário; migração de `app_data` para tabelas relacionais no Supabase com regras de acesso por cliente; credenciais do WhatsApp por cliente, criptografadas; webhook que identifica o cliente pelo número). Revise com o Marco antes de implementar, porque mexe em tudo.
3. **Papéis e equipes por cliente.**
4. **Painel (fase 9) por cliente e exportação CSV.**
5. **Sair da simulação:** ligar Supabase, WhatsApp Cloud API e provedor de IA, e testar com um número real.
6. Depois, os itens "Fase 2" do backlog. Os de maior valor para a agência: UTM/GCLID/FBCLID por lead, exportação de conversões para Google e Meta Ads, funis e etapas por cliente, tarefas e lembretes.

## 5. Como trabalhar
- Peça um item do backlog por vez ao Claude Code, com o critério de aceite em português.
- Ao concluir, atualize a coluna "Situação no código" do item no Notion e abra um pull request.
- Segredos (Meta, Supabase, IA) só em `.env.local` e nos secrets do GitHub e da hospedagem. Nunca no chat nem no código.
- Dúvidas de negócio vão para o Marco. As dúvidas técnicas em aberto estão no fim do `CLAUDE.md`.
