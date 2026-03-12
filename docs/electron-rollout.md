# BHASH Electron Rollout

## Objetivo
Cliente instalavel no Windows com:

- inicializacao automatica com o sistema
- notificacao em background com som
- update automatico de versao

## Modelo de update definido

Update unico para todos os clientes (canal unico):

- Feed: `https://updates.bhash.com/desktop/win`
- Formato: provider `generic` do `electron-updater`

Quando uma nova versao e publicada nesse mesmo endpoint, todos os clientes convergem para ela.

## Estado atual do modulo desktop

Pasta: `desktop-electron/`

Implementado:

- `src/main.js` (janela principal, tray, auto-start, updater, IPC)
- `src/preload.js` (bridge segura `window.bhashDesktop`)
- `src/setup.html` (tela "Minhas configuracoes")
- notificacao nativa acionada pelo frontend via `window.bhashDesktop.notify(...)`
- `scripts/generate-defaults.js` (sincroniza defaults do Electron a partir do `.env` da raiz)

## Fluxo de release (single update channel)

0. Ajustar `.env` da raiz (fonte unica):
   - `CHAT_WEB_URL`
   - `DESKTOP_UPDATE_URL`
1. Definir opcionalmente `DESKTOP_UPDATE_PUBLISH_DIR` no `.env` (pasta local/rede do endpoint de update).
2. Rodar release:
   - `npm run desktop:release:win`
3. O script incrementa `patch`, gera artefatos e publica:
   - `BHash Desktop Setup <version>.exe`
   - `latest.yml`
   - `*.blockmap`
4. Clientes detectam update automaticamente e aplicam no restart do app.

Variantes de release:

- `npm run desktop:release:win:minor`
- `npm run desktop:release:win:major`
- `npm run desktop:release:win -- --version 0.1.10`

Fluxo tenant-aware (recomendado):

- `npm run deploy:desktop:release -- --tenant-file deploy/tenant.env`

## Modo corporativo sem senha por update (SYSTEM task)

Quando o app esta em `Program Files` (`all-users`), update normal pode pedir UAC.
Para evitar senha em cada update:

1. Instalar o app uma vez com admin.
2. Instalar updater de maquina (SYSTEM):
   - `npm run desktop:updater:install`
   - se HTTPS local nao confiado pelo SYSTEM: `npm run desktop:updater:install:insecure`
3. Publicar novas versoes no canal:
   - `npm run desktop:release:win`
4. Verificar status/log:
   - `npm run desktop:updater:status`

Comandos de manutencao:

- remover tarefa: `npm run desktop:updater:remove`

Comportamento:

- updater checa feed periodicamente
- se `BHashChat.exe` estiver aberto, adia update
- aplica update silencioso quando app estiver fechado

## Requisitos de infraestrutura

- Backend/frontend/admin operando como servicos no servidor.
- URL do chat acessivel pela maquina cliente.
- Endpoint HTTP estavel para os artefatos de update.

## Boas praticas recomendadas

- Assinar binario do Windows (code signing) para reduzir alertas do SmartScreen.
- Versionamento sem pular semver para facilitar rollout.
- Manter historico de artefatos por versao para rollback manual.
