# Arquitetura auditada

## Componentes e fluxo atual

```text
Navegador / Electron
        |
        +-- desenvolvimento HTTP: Vite 5173 / admin 5174
        |
        +-- HTTPS local: Caddy no Windows, fora do repositório
                  | /              -> chat 5173 ou admin 5174
                  | /api/*         -> backend 3000, retirando /api
                  | /socket.io/*   -> backend 3000, WebSocket
                  | host de update -> C:\caddy\updates
                                  |
                      NestJS no HOST (Node/PM2)
                          |                  |
                  localhost:5432     backend/public/uploads
                          |
                  PostgreSQL 16 Docker
                  volume bhash_bhash_pg

Redis7 Docker :6379 existe, sem integração de app encontrada.
```

**[CONFIRMADO]** O desenho é derivado dos arquivos. **[DESCONHECIDO]** Saúde ponta a ponta na data auditada; banco estava parado. HTTPS local não equivale a produção.

## Repositório

| Diretório/arquivo | [CONFIRMADO] responsabilidade |
|---|---|
| `backend/src` | NestJS, HTTP/Socket.IO, regras, auth, uploads, retenção. |
| `backend/prisma` | Schema, 22 migrations, seed e configuração auxiliar. |
| `frontend` | SPA React do chat; grande parte dos fluxos em `src/pages/ChatPage.tsx`. |
| `frontend-admin` | SPA React administrativa; `server.cjs` serve build e faz proxy no modo PM2 proxy. |
| `desktop-electron` | Cliente Electron, defaults gerados, build Windows e updater. |
| `deploy` / `scripts/deploy` | Templates tenant, geração de kit e execução de preparação/deploy. |
| `scripts/linux` | Primeiro deploy, update, status e unit systemd PM2. |
| `scripts/windows` | Boot PM2/Caddy e instalação/atualização de clientes. |
| `docs` | HTTPS/PWA, Nginx, Caddy Windows, rollout desktop. |
| `docker-compose.yml` | Apenas PostgreSQL/Redis. |
| `ecosystem*.config.cjs` | Três processos Node PM2, modo normal/proxy. |

## Dependências e reprodução

**[CONFIRMADO]** Existem cinco pares `package.json`/`package-lock.json`: raiz, backend, frontend, frontend-admin e desktop-electron. Não há declaração de npm workspaces; os scripts usam `npm --prefix`.

| Camada | [CONFIRMADO] dependências principais |
|---|---|
| Raiz | concurrently 9, PM2 6 (dependência local de desenvolvimento). |
| Backend | NestJS 11, Prisma 7.3, adapter-pg/pg 8, Socket.IO 4.8, Passport/JWT, Argon2, TypeScript. |
| Chat/admin | React 19.2.4, Vite 7.3.1, TypeScript 5.9.3 nos locks; Axios, Socket.IO-client; bibliotecas de planilhas/ZIP/previews. |
| Electron | aplicativo 0.1.3; lock Electron 37.10.3, electron-builder 25.1.8, updater 6.8.3. |
| Infra Docker | postgres:16, redis:7 (tags por versão maior, sem pin por digest). |

**[CONFIRMADO]** Notebook auditado: Node 24.15.0, npm 11.12.1, Git 2.55.0.windows.4, Docker client/server 29.6.2, Compose 5.3.1, contexto `desktop-linux`, WSL2 `docker-desktop`. Vite exige Node `^20.19.0 || >=22.12.0`; “Node 20+” no README é insuficientemente preciso.

**[PLANEJADO]** Para reproduzir este estado, usar inicialmente Node 24.15.0/npm 11.12.1 e os locks via `npm ci` por módulo. Atualização de dependências é trabalho posterior. Não transportar `node_modules` Windows para Linux.

## Backend e banco

**[CONFIRMADO]** `backend/src/main.ts` inicializa Nest, CORS, porta 3000 e host configurável. `src/prisma/prisma.service.ts` usa pool pg e Prisma adapter e conecta ao inicializar. `src/common/project-env.ts` carrega `.env` da raiz.

**[CONFIRMADO]** Há 17 models: empresas, setores, usuários, admins, configuração, conversas, participantes, regras automáticas, quatro tabelas de público/exclusões de broadcast, mensagens, estado individual, visibilidade, favoritos e reações. Relações e enums estão em `backend/prisma/schema.prisma`.

**[CONFIRMADO]** JWT HTTP consulta atividade/tipo de conta; tokens têm duração configurada de 12 h. Socket valida JWT no handshake e gerencia presença/salas em memória. Não foi encontrado adapter Redis distribuído, S3/MinIO, fila ou worker externo no backend.

**[INFERIDO]** O desenho pressupõe uma instância de backend com disco local. Escala horizontal precisa coordenar sessões/eventos, retenção e storage; Redis existente não entrega isso automaticamente.

**[CONFIRMADO]** Prisma efetivo: `backend/prisma.config.ts`; schema usa `prisma-client-js` sem `output`, e a aplicação importa `@prisma/client`. O cliente atual é gerado em `backend/node_modules/.prisma/client`. A entrada ignorada `backend/generated/prisma` é legado, não o destino atual. Existe também `backend/prisma/prisma.config.ts` e arquivos antigos de service/module nessa pasta; conferir imports efetivos em `src`, não deduzir execução de arquivos duplicados.

## Interfaces e configuração

**[CONFIRMADO]** Interfaces usam composição/estado React, sem React Router declarado. API usa `VITE_API_BASE` quando disponível; em HTTPS fora de localhost tende a `/api`; em HTTP tende ao hostname atual na porta 3000. Socket usa `/socket.io`. Configuração de cores/logo vem da API `/app-config`.

**[CONFIRMADO]** Ambos `vite.config.ts` chamam `loadEnv(mode, process.cwd(), '')`, sem `envDir` apontando para raiz. `env:init` apenas copia o `.env` raiz. **[INFERIDO]** Variáveis VITE só nesse arquivo podem não chegar ao build executado com cwd do subprojeto. Não afirmar `.env` central integralmente funcional sem corrigir/testar esse contrato.

**[CONFIRMADO]** Dev chat/admin são 5173/5174; `vite preview` sem argumentos usa 4173/4174, mas PM2 força 5173/5174. Dev/proxy Vite encaminha `/api` e `/socket.io` ao backend. Admin modo proxy usa `server.cjs` e possui `/health` próprio, que não confirma banco.

**[CONFIRMADO]** `frontend/.env.https` e `frontend-admin/.env.https` existem localmente e são ignorados; não contêm apontamento de chave/cert. Config Vite usa `https: {}`. **[DESCONHECIDO]** `dev:https` independente funcionando em máquina limpa. Recuperação básica deve partir de HTTP local, deixando Caddy para etapa própria.

## Processos e scripts relevantes

| Comando | [CONFIRMADO] efeito; não executado na auditoria |
|---|---|
| `npm run dev:all` | env:init + backend watch + dois Vite dev, com concurrently. |
| `npm run install:all` | npm install raiz/backend/chat/admin; não inclui desktop. |
| `npm run build:all` | builds backend/chat/admin; grava dist. |
| `npm run setup:server` | env:init, install:all, generate, migrate deploy, build; não seed. |
| `npm run services:start:proxy` | PM2 local com ecosystem proxy; inicia processos. |
| `npm run server:update` | Só build/reload/save; diferente do script Linux update que também faz pull/install/migrate. |
| `npm run desktop:install` | Instala dependências Electron separadamente. |
| `npm run desktop:dist:win` | Gera defaults e instalador NSIS x64. |
| `npm run deploy:server:up` | Aplica tenant sobrescrevendo env, sobe infra, instala/migra/builda e inicia PM2. |

**[CONFIRMADO]** Backend PM2 usa `backend/dist/src/main.js` com cwd `backend`. Script `backend` `start:prod` aponta `dist/main`, divergente do artefato observado. Caminhos de upload dependem de cwd; não iniciar o JS a partir da raiz sem conferir.

## Limites técnicos relevantes

**[CONFIRMADO]** Não há pipeline CI versionado, Dockerfiles, stack completa conteinerizada, testes frontend/desktop ou backup/rollback automatizado encontrados. Specs backend estão desatualizados; o E2E inicializa banco/scheduler real. Sem testes executados nesta auditoria.

**[CONFIRMADO]** Questões de segurança presentes no código: senha lembrada em localStorage nas duas interfaces; `/static` sem auth; exceções de certificado no Electron; CORS `LAN` amplo; backend/admin modo proxy em `0.0.0.0`; mínimos de senha inconsistentes. São itens para revisão específica antes de produção, não mudanças feitas aqui.
