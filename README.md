# Sistema Leads MVP

CRM de prospecção e relacionamento comercial: quadro Kanban de leads, importação de contatos, busca de empresas, campanhas de WhatsApp pela **API oficial** (só para contatos que autorizaram) e autoresponder com IA que passa para uma pessoa quando necessário.

> **Status: fase 5 de 10 (campanhas e fila de envio).**
> Fases 1 a 4 (login, leads + Kanban, importação de CSV, busca de empresas) testadas no computador da usuária. A fase 5 foi escrita sem poder instalar os pacotes no ambiente de criação: a lógica (público só com opt-in, fila, limite diário, horário de envio, reconferência de consentimento) foi executada e conferida com testes automáticos, mas a tela só roda de verdade no seu computador. **Nenhuma mensagem é enviada de verdade**: o envio é simulado até a fase 8. Se aparecer algum erro, copie a mensagem inteira para corrigirmos.

## O que já funciona

**Fase 1**
- Criar conta, entrar e sair (modo simulação: contas guardadas em um arquivo local).
- Menu lateral recolhível e layout responsivo em português do Brasil.

**Fase 2**
- **Kanban** com 6 etapas (Prospecção → Novo → Contatado → Respondeu → Reunião agendada → Fechado/Perdido): arraste os cartões entre colunas e a posição fica gravada. No celular, use a lista "Mover para…" de cada cartão.
- **Leads**: criar, editar, excluir, buscar e filtrar por etapa e por autorização.
- **Telefone** guardado no formato internacional (E.164) e **sem duplicados**: o mesmo número em formatos diferentes é reconhecido como o mesmo lead.
- **Opt-in / opt-out** de marketing, com data e origem registradas. Quem pede para sair nunca mais recebe marketing. Quem não tem autorização aparece como bloqueado para campanhas.
- **Histórico** de cada lead (criação, mudança de etapa, notas, edições e autorizações) e **tags**.
- Testes automáticos de senha, sessão, login, telefone, ordenação, regras de leads e datas.

**Fase 3**
- **Importar CSV** (menu → Importar CSV): escolha a planilha, veja uma **prévia** (novas, repetidas, com erro) e só então confirme. Aceita planilhas do Excel (`;`, acentos em Windows-1252) e do Google Planilhas (`,`, UTF-8). Até 1.000 linhas e 500 KB por importação.
- Colunas reconhecidas: `nome` (obrigatória), `empresa`, `telefone`, `email`, `tags`, `observacoes`, `opt_in`, `origem_opt_in`. A ordem não importa e colunas desconhecidas são ignoradas.
- **Sem duplicados**: telefone repetido na planilha ou que já existe na base é pulado, e importar o mesmo arquivo duas vezes não duplica ninguém.
- **Autorização (opt-in)**: todo contato importado entra **sem autorização**, a não ser que a planilha traga `opt_in = sim` **e** a origem (`formulario`, `whatsapp`, `cliente`, `presencial` ou `outro`).
- **Relatório** do que não entrou (com o motivo de cada linha) para baixar em CSV, e **modelo de planilha** para baixar.

**Fase 4**
- **Prospecção** (menu → Prospecção): digite o tipo de negócio (padaria, dentista, academia...) e a cidade, veja a lista de empresas com telefone, endereço e site, marque as que interessam e clique em **Adicionar à Prospecção**. Elas entram na coluna **Prospecção** do Kanban.
- Empresas encontradas entram **sem autorização (opt-in)** e ficam bloqueadas para campanhas. Quem já está na base aparece como "Já está na base" e não é adicionado de novo.
- **Limite diário de buscas** (padrão 20 por dia, no horário de Brasília) para não sobrecarregar o servidor gratuito do mapa. A mesma busca repetida no mesmo dia vem da memória e não gasta o limite.
- Em **modo simulação** a lista é de empresas inventadas (para testar a tela). Veja "Busca real" abaixo para usar o mapa de verdade.

**Fase 5**
- **Modelos de mensagem** (Campanhas → Modelos de mensagem): texto com `{{nome}}` e `{{empresa}}`. Na API oficial do WhatsApp, marketing só sai por modelos aprovados pela Meta; na simulação, o botão **Simular aprovação** libera o modelo.
- **Campanhas** (menu → Campanhas): escolha o modelo, as etapas do Kanban e (opcional) uma tag. Só recebe quem tem **telefone e autorização (opt-in)** e não pediu para sair. **A etapa Prospecção nunca recebe campanhas.** A campanha nasce como rascunho; nada sai até você iniciar.
- **Fila e lotes**: o botão **Enviar próximo lote** manda até 10 mensagens por vez. Pode pausar, retomar e cancelar. Cada mensagem fica registrada com o resultado (enviada, falhou ou pulada, com o motivo).
- **Conformidade na hora do envio**: antes de cada mensagem o sistema confere de novo se o contato ainda tem opt-in, não saiu da lista, ainda tem o mesmo telefone e não está em Prospecção. Quem não passa é pulado.
- **Configurações** (menu → Configurações): limite de envios por dia (somando todas as campanhas), horário de envio (fuso de São Paulo), só dias úteis e a **frase para sair da lista** (obrigatória, com a palavra SAIR), que vai no fim de toda mensagem.
- Ao enviar, o histórico do lead ganha o registro da mensagem e quem estava em **Novo** passa para **Contatado**.
- **Simulação de falha**: um telefone terminado em `0000` falha no envio simulado, para você testar esse caso.

## Busca real (OpenStreetMap)

Sem cadastro, sem chave e sem cartão. No arquivo `.env.local`, acrescente:

```
PLACES_PROVIDER=osm
OSM_CONTACT=seu-email@exemplo.com
SEARCH_DAILY_LIMIT=20
```

Reinicie o sistema (`Ctrl+C` e depois `npm run dev`). O `OSM_CONTACT` é só para o OpenStreetMap saber quem está usando (a política deles pede isso). O mapa é colaborativo: nem toda empresa está cadastrada, e nem toda empresa tem telefone. Dados: © Contribuidores do OpenStreetMap (licença ODbL), com a atribuição mostrada na própria tela.

## Como rodar no seu computador

### 1. Instale o Node.js (uma vez)

1. Abra **nodejs.org** e baixe a versão **LTS** (botão verde).
2. Instale clicando em "Next" até o fim.
3. Abra o terminal (Windows: tecla Windows, digite `PowerShell`, Enter. Mac: Cmd+Espaço, digite `Terminal`).
4. Digite `node --version` e Enter. Deve aparecer um número como `v22.x.x`. A versão precisa ser 20 ou maior.

### 2. Abra a pasta do projeto no terminal

Descompacte o arquivo `sistema-leads-mvp.zip`. No terminal, entre na pasta (troque o caminho pelo seu):

```
cd C:\Users\SeuNome\Downloads\sistema-leads-mvp
```

Dica: no Windows, abra a pasta no Explorador, clique na barra de endereço, digite `powershell` e Enter. O terminal já abre na pasta certa.

### 3. Instale as peças do projeto

```
npm install
```

Leva alguns minutos e mostra muita coisa na tela. É normal. Avisos amarelos ("warn") podem ser ignorados.

### 4. Crie o arquivo de configuração

Windows (PowerShell):

```
Copy-Item .env.example .env.local
```

Mac/Linux:

```
cp .env.example .env.local
```

Depois gere um segredo para o login:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o texto que aparecer, abra o arquivo `.env.local` em um editor (o Bloco de Notas serve) e cole depois de `SESSION_SECRET=`. Salve. **Esse arquivo nunca vai para o GitHub.**

### 5. Ligue o sistema

```
npm run dev
```

Abra **http://localhost:3000** no navegador. Para desligar, volte ao terminal e aperte `Ctrl+C`.

## Comandos úteis

| Comando | Para que serve |
|---|---|
| `npm run dev` | Liga o sistema para você usar e testar |
| `npm test` | Roda os testes automáticos (tudo deve ficar verde) |
| `npm run lint` | Procura erros de estilo no código |
| `npm run typecheck` | Confere os tipos do TypeScript |
| `npm run build` | Gera a versão final, como a que vai para a internet |

## Modo simulação

Com `MOCK_MODE=true` (o padrão) o sistema funciona **sem nenhuma chave** de serviço externo. Os dados de teste ficam dentro da pasta do projeto, em `.data/` (esta pasta não vai para o GitHub): contas em `.data/users.json` e leads em `.data/leads.json`. Para apagar tudo e recomeçar do zero, apague a pasta `.data`.

## Estrutura de pastas

```
sistema-leads-mvp/
├── CLAUDE.md                 regras do projeto (conformidade, fases)
├── .env.example              modelo do arquivo de configuração
├── src/
│   ├── app/
│   │   ├── (auth)/           telas de entrar e criar conta
│   │   └── (app)/            telas do sistema (exigem login)
│   │       ├── kanban/       quadro Kanban
│   │       ├── leads/        lista, novo lead, detalhes e ações do servidor
│   │       ├── importar/     importação de CSV
│   │       ├── campanhas/    campanhas, modelos de mensagem e fila de envio
│   │       ├── configuracoes/ limite diário, horário e frase de saída
│   │       └── prospeccao/   busca de empresas
│   ├── components/           menu lateral, Kanban, formulário de lead, botões, campos
│   └── lib/
│       ├── auth/             login (adaptador de simulação; Supabase depois)
│       ├── leads/            regras dos leads, repositório (arquivo local; Supabase depois)
│       ├── campaigns/        campanhas: público, fila, limite diário, horário, envio simulado
│       ├── places/           busca de empresas (simulada e OpenStreetMap), limite diário
│       ├── phone.ts          telefone no formato E.164
│       ├── security.ts       senhas e cookie de sessão
│       └── nav.ts            lista de seções do menu
└── tests/                    testes automáticos (Vitest)
```

## Segurança

- Senhas guardadas só como hash (scrypt), nunca em texto.
- Cookie de login assinado (HMAC), `httpOnly`, com validade de 7 dias.
- Chaves ficam em `.env.local`, que o `.gitignore` bloqueia. Antes de publicar no GitHub, rode `git status` e confirme que `.env.local` e `.data` **não** aparecem na lista.

## Aviso de conformidade (LGPD e Meta)

Este projeto foi desenhado para usar apenas caminhos oficiais:

- WhatsApp **somente** pela WhatsApp Cloud API da Meta, com templates aprovados.
- Mensagens de marketing **só** para contatos com autorização (opt-in) registrada, com opção de sair ("SAIR").
- Não automatiza curtir, seguir ou comentar no Instagram.

O autor não é advogado. Para uso comercial, consulte alguém de compliance.

## Próximas fases

~~2 leads + Kanban~~ (feita) · ~~3 importação CSV~~ (feita) · ~~4 busca de empresas~~ (feita) · ~~5 campanhas + fila~~ (feita) · 6 caixa de entrada + autoresponder · 7 agendador · 8 WhatsApp real · 9 painel · 10 Instagram (opcional).

## Licença

MIT. Edite o arquivo `LICENSE` e troque `SEU NOME AQUI` pelo seu nome.
