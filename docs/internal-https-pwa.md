# Deploy Interno HTTPS + PWA (sem publicacao externa)

Este guia e para ambientes corporativos internos (LAN/VPN), com instalacao PWA em Android/iOS.

## Objetivo

- Servir chat e admin por HTTPS com certificado confiavel na rede interna.
- Evitar acesso direto por porta (`:5173`, `:5174`, `:3000`) nos celulares.
- Permitir instalacao como app (PWA) em Android e adicionacao na tela inicial no iOS.

## Arquitetura recomendada

- `https://chat.interno.empresa` -> frontend chat (`127.0.0.1:5173`)
- `https://admin-chat.interno.empresa` -> frontend admin (`127.0.0.1:5174`)
- `/api` e `/socket.io` -> backend (`127.0.0.1:3000`)

Tudo acessado via reverse proxy HTTPS (Nginx/IIS/Caddy), com certificado da CA interna.

## 1) Preparar aplicacao no servidor

Na raiz do projeto:

```bash
npm run setup:server
```

Suba com o arquivo PM2 para proxy interno (bind local):

```bash
npm run services:start:proxy
npm run services:save
```

Esse modo usa `ecosystem.proxy.config.cjs`:

- backend em `127.0.0.1:3000`
- chat em `127.0.0.1:5173`
- admin em `127.0.0.1:5174`

## 2) Configurar DNS interno

Crie entradas DNS internas apontando para o IP do servidor:

- `chat.interno.empresa`
- `admin-chat.interno.empresa`

## 3) Certificado HTTPS interno

Emita certificado para os FQDNs acima pela CA interna (AD CS/PKI corporativa).

SAN minimo:

- `chat.interno.empresa`
- `admin-chat.interno.empresa`

Instale o certificado no reverse proxy.

## 4) Configurar reverse proxy

### Opcao A: Nginx (Linux)

Use o exemplo em `docs/nginx/bhash-internal.conf`.

Ajuste:

- `server_name`
- caminhos de `ssl_certificate` e `ssl_certificate_key`

Depois valide e recarregue:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Opcao B: IIS + ARR (Windows)

Passos:

1. Instale roles `IIS`, `URL Rewrite` e `Application Request Routing`.
2. Crie bindings HTTPS para os dois hosts com certificado interno.
3. Regra para `chat.interno.empresa`:
- `/api/*` -> `http://127.0.0.1:3000/{R:1}` (removendo prefixo `/api`)
- `/socket.io/*` -> `http://127.0.0.1:3000/socket.io/{R:1}` com suporte a WebSocket
- `/*` -> `http://127.0.0.1:5173/{R:0}`
4. Regra para `admin-chat.interno.empresa`:
- `/api/*` -> `http://127.0.0.1:3000/{R:1}`
- `/socket.io/*` -> `http://127.0.0.1:3000/socket.io/{R:1}`
- `/*` -> `http://127.0.0.1:5174/{R:0}`
5. Habilite WebSocket Protocol no IIS.

### Opcao C: Caddy (Windows/Linux)

Use o guia:

- `docs/caddy/windows-caddy-internal.md`

Resumo:

1. Caddy faz TLS interno automaticamente (`local_certs`).
2. Proxy do chat/admin em HTTPS para `127.0.0.1:5173/5174`.
3. `/api` e `/socket.io` apontam para `127.0.0.1:3000`.
4. Instalar a CA local do Caddy nos celulares para remover alerta de certificado.

## 5) CORS no backend

Defina no `.env` do servidor:

```env
CORS_ORIGINS=https://chat.interno.empresa,https://admin-chat.interno.empresa
APP_HOST=127.0.0.1
PORT=3000
```

Depois:

```bash
npm run services:reload:proxy
```

## 6) PWA no Android/iOS

Requisitos para aparecer instalacao correta:

- URL HTTPS valida
- certificado confiavel no celular
- service worker ativo (ja configurado no frontend em build de producao)

No Android (Chrome):

- deve aparecer `Instalar app` quando elegivel.

No iOS (Safari):

- usar `Compartilhar > Adicionar a Tela de Inicio` (nao existe o mesmo prompt do Android).

## 7) Checklist rapido de teste

1. Abrir `https://chat.interno.empresa`.
2. Confirmar cadeado sem alerta de certificado.
3. DevTools > Application > Manifest sem erro.
4. DevTools > Application > Service Workers registrado.
5. Instalar no Android e validar abertura sem barra do navegador.
