# BHASH Desktop (Electron)

Cliente instalavel do chat com:

- notificacao nativa (Windows)
- auto-start no login do usuario
- update automatico em canal unico

## Requisitos

- Node.js 20+
- npm 10+

## Rodar em desenvolvimento

Na raiz do projeto:

```bash
npm run env:init
npm run desktop:install
npm run desktop:dev
```

O Electron sincroniza defaults automaticamente a partir do `.env` da raiz:

- `CHAT_WEB_URL` (ou `BHASH_DESKTOP_SERVER_URL`)
- `DESKTOP_UPDATE_URL` (ou `BHASH_DESKTOP_UPDATE_URL`)

## Build instalavel (Windows)

```bash
npm run desktop:dist:win
```

Antes do build, os defaults acima sao embutidos no instalador.

Arquivos de saida:

- `desktop-electron/dist/*.exe`
- `desktop-electron/dist/latest.yml`
- `desktop-electron/dist/*.blockmap`

Se o build falhar com erro de symlink (`winCodeSign ... Cannot create symbolic link`):

1. abra PowerShell como Administrador, ou
2. ative o "Modo de desenvolvedor" no Windows (permite symlink sem admin).

## Canal de update unico

O app usa um unico feed de update para todos os clientes:

`https://updates.bhash.com/desktop/win`

Esse canal esta definido em `desktop-electron/package.json` (`build.publish.url`).

Fluxo de update:

1. gerar novo instalavel com versao maior
2. publicar artefatos no mesmo endpoint (`.exe`, `latest.yml`, `.blockmap`)
3. clientes instalados detectam e baixam automaticamente
4. update aplica no proximo restart do app

## Release em 1 comando (recomendado)

No `.env` da raiz, defina opcionalmente:

```env
DESKTOP_UPDATE_PUBLISH_DIR=\\srv-arquivos\updates\bhash\desktop\win
```

Depois execute na raiz:

```bash
npm run desktop:release:win
```

Esse comando:

1. incrementa versao `patch` no `desktop-electron/package.json`
2. gera o instalador novo (`desktop:dist:win`)
3. publica `exe + latest.yml + blockmap` em `DESKTOP_UPDATE_PUBLISH_DIR` (quando definido)

Variantes:

```bash
npm run desktop:release:win:minor
npm run desktop:release:win:major
npm run desktop:release:win -- --version 0.1.10
```

Com tenant kit (recomendado para multi-empresa):

```bash
npm run deploy:desktop:release -- --tenant-file deploy/tenant.env
```

## Modo maquina (1 instalacao + updates sem senha)

Para ambientes compartilhados (varios usuarios no mesmo PC), use o updater de maquina:

1. Instale o app desktop normalmente como `all-users` (uma vez, com admin).
2. Publique releases no canal unico (`desktop:release:win`).
3. Instale a tarefa SYSTEM (uma vez, com admin):

```bash
npm run desktop:updater:install
```

Se o feed HTTPS usa certificado local e o `SYSTEM` nao confia no certificado:

```bash
npm run desktop:updater:install:insecure
```

Essa tarefa roda como `SYSTEM`, checa o feed de update periodicamente e aplica update silencioso.

Comandos uteis:

```bash
npm run desktop:updater:status
npm run desktop:updater:remove
```

Observacoes:

- o updater de maquina ignora update enquanto `BHashChat.exe` estiver aberto
- o update sera aplicado na proxima janela em que o app estiver fechado
- se usar certificados locais no feed HTTPS, garanta confianca no certificado em nivel de maquina

## Ajustes pelo usuario final

No app desktop:

- tray icon > `Minhas configuracoes`
- alterar URL do servidor
- ativar/desativar inicio com Windows
- checar update manualmente
