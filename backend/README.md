# BHASH Backend (NestJS + Prisma)

API principal do sistema.

## Stack

- NestJS
- Prisma ORM
- PostgreSQL
- Socket.IO

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL (ou `docker compose` da raiz)

## Configuracao

Use o arquivo central da raiz:

```bash
cd ..
npm run env:init
```

Exemplo base:

```env
DATABASE_URL=postgresql://bhash:bhashpass@localhost:5432/bhash
JWT_SECRET=troque-por-uma-chave-forte
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,LAN
CHAT_WEB_URL=http://localhost:5173
DESKTOP_UPDATE_URL=https://updates.bhash.com/desktop/win
```

O backend carrega automaticamente somente `.env` da raiz.

## Instalar dependencias

```bash
npm install
```

## Prisma

Gerar client:

```bash
npm run prisma:generate
```

Aplicar migracoes:

```bash
npm run prisma:migrate:deploy
```

## Rodar em desenvolvimento

```bash
npm run start:dev
```

## Build + Producao

```bash
npm run build
npm run start:prod
```

## Integracao com deploy da raiz

Para deploy completo do sistema, use os comandos da raiz:

```bash
cd ..
npm run setup:server
npm run services:start
```

## Troubleshooting

### Erros de Prisma Client/tipos ausentes

```bash
npm run prisma:generate
```

### Erro de conexao com banco

- valide `DATABASE_URL`
- confirme Postgres ativo (`docker ps` ou servico local)
