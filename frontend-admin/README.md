# BHASH Frontend Admin

Painel administrativo do sistema.

## Stack

- React
- TypeScript
- Vite
- Socket.IO Client

## Configuracao

Use o arquivo central `.env` na raiz do projeto:

```env
# Recomendado em servidor interno com reverse proxy HTTPS:
# VITE_API_BASE=/api
# VITE_WS_PATH=/socket.io

# Dev local sem proxy:
VITE_API_BASE=http://localhost:3000
```

Se nao definir:

- em `https://` (fora de localhost): usa `/api` automaticamente
- em `http://`: usa `<host-atual>:3000`

## Instalar dependencias

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

Porta padrao: `5174`.

### Dev HTTPS

```bash
npm run dev:https
```

Modo `https` usa `frontend-admin/.env.https`.

## Build de producao

```bash
npm run build
```

## Preview local (producao)

```bash
npm run preview -- --host 0.0.0.0 --port 5174 --strictPort
```

## Integracao com deploy da raiz

No ambiente de servidor, nao rode isolado.
Use os comandos da raiz:

```bash
cd ..
npm run setup:server
npm run services:start
```
