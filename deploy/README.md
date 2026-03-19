# Deploy Kit (Multi-Empresa)

Objetivo: trocar dados da empresa em **um unico arquivo** e gerar tudo para servidor + cliente.

## 1) Preparar tenant

1. Copie `deploy/tenant.env.example` para `deploy/tenant.env`.
2. Ajuste somente os valores dessa empresa (IP, dominios, secrets, pasta de updates).
3. Se quiser HTTPS apenas no chat, deixe `ADMIN_HTTPS_ENABLED=false`.
4. Se quiser admin tambem em HTTPS, use `ADMIN_HTTPS_ENABLED=true` e preencha `ADMIN_HOST`.

Opcional (atalho):

```bash
npm run deploy:init
```

## 2) Gerar kit

Na raiz do projeto:

```bash
npm run deploy:render -- --tenant-file deploy/tenant.env
```

Saida:

- `deploy/out/<TENANT_SLUG>/server/.env`
- `deploy/out/<TENANT_SLUG>/server/Caddyfile.windows`
- `deploy/out/<TENANT_SLUG>/server/nginx.internal.conf`
- `deploy/out/<TENANT_SLUG>/client/windows/instalar-bhash-pc-novo.cmd`

Opcional: aplicar `.env` direto na raiz:

```bash
npm run deploy:render:apply -- --tenant-file deploy/tenant.env
```

## 3) Subir servidor (base atual do projeto)

```bash
npm run deploy:server:up -- --tenant-file deploy/tenant.env
```

Esse comando:

1. aplica `.env` gerado
2. sobe Docker infra (`postgres`/`redis`)
3. builda backend/front/admin
4. sobe PM2 (modo proxy interno por padrao)
5. salva estado PM2

Para Windows servidor, rode depois em PowerShell como Administrador:

```bash
npm run server:startup:install
```

Esse passo instala:

- `BHash-PM2-Resurrect` em `SYSTEM / AtStartup`
- `BHash-Caddy-Start` em `SYSTEM / AtStartup`

Resultado: o servidor sobe sem depender do login do usuário e sem janela de PowerShell do Caddy.

## 4) Publicar desktop + canal de update

```bash
npm run deploy:desktop:release -- --tenant-file deploy/tenant.env
```

Esse comando:

1. incrementa versao desktop
2. gera instalador
3. publica `exe + latest.yml + blockmap` em `UPDATES_PUBLISH_DIR`
4. publica ferramentas em `UPDATES_PUBLISH_DIR/tools`
   - `bootstrap-desktop-new-pc.ps1`
   - `desktop-machine-updater.ps1`
   - `install-desktop-updater-task.ps1`
   - `status-desktop-updater-task.ps1`
   - `instalar-bhash-pc-novo.cmd` (gerado por tenant)

## 5) Preparar cliente Windows (fluxo rapido)

1. Instalar o setup desktop.
2. Instalar certificado interno.
3. Rodar `instalar-bhash-pc-novo.cmd` (UAC).

Resultado: task SYSTEM de updater instalada, updates sem senha por usuario.
