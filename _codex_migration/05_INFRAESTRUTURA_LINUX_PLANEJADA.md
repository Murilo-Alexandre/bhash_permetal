# Infraestrutura Linux: preparada, não implantada

**[CONFIRMADO]** Existem instruções e scripts Linux no repositório. **[DESCONHECIDO]** Nenhum host Linux remoto foi acessado ou validado. **[CONFIRMADO]** O usuário declara que o projeto ainda não está em produção.

## O plano que o código realmente implementa

**[CONFIRMADO]** O procedimento preparado no README usa `/opt/bhash`, Node/npm no Linux, Docker Engine + Compose para PostgreSQL/Redis, PM2 para os três aplicativos, e opcionalmente Nginx para HTTPS. Não há imagens próprias da aplicação, registry nem deploy de stack completa.

| Item | Estado e evidência |
|---|---|
| Clone e diretório /opt/bhash | [PLANEJADO] README: 110 em diante. Não é diretório verificado em servidor. |
| Instalação/build web/backend | [CONFIRMADO] `setup:server` instala dependências, gera Prisma, aplica migrations e builda. |
| Banco/Redis containers | [CONFIRMADO] Compose atual, sem parametrização segura de credenciais ou healthchecks. |
| Node/PM2 no host | [CONFIRMADO] ecosystem normal/proxy e scripts start/reload/save. |
| Inicialização Linux | [CONFIRMADO] Gerador de unit systemd PM2; execução real [DESCONHECIDO]. |
| Reverse proxy Linux | [CONFIRMADO] Modelo Nginx estático e gerador de configuração por tenant. Ativação [DESCONHECIDO]. |
| TLS Linux | [PLANEJADO] CA interna/certificados fornecidos ao Nginx. Emissão/renovação operacional não implementadas nos scripts. |
| App em containers | [PLANEJADO] Caso seja o destino escolhido; ainda falta implementar. |

## Scripts existentes e efeitos

**[CONFIRMADO]** `scripts/linux/first-deploy.sh` recebe diretório, executa `infra:up`, `setup:server`, `services:start` e `services:save`. Isso modifica infraestrutura, arquivos e banco. Não foi executado nesta auditoria.

**[CONFIRMADO]** `scripts/linux/update.sh` faz `git pull --ff-only`, `setup:server`, `services:reload`, `services:save`. Não fixa commit/release, não faz backup, não verifica saúde nem oferece rollback automático. Opera no mesmo diretório da aplicação.

**[CONFIRMADO]** Ambos usam PM2 **normal**, não `:proxy`. O normal expõe chat/admin em 0.0.0.0. O proxy atual também expõe backend 3000 e admin 5174 em 0.0.0.0; só chat 5173 usa 127.0.0.1. Guias que dizem todos em loopback não refletem `ecosystem.proxy.config.cjs:8–33`.

**[CONFIRMADO]** `install-systemd-service.sh` cria `/etc/systemd/system/bhash-pm2-resurrect.service`, com usuário selecionado, PM2_HOME no home desse usuário, `WorkingDirectory` do projeto, `ExecStart=<repo>/node_modules/.bin/pm2 resurrect`, `After/Wants=network-online.target docker.service`, `Type=oneshot`, `RemainAfterExit=yes`. Ativa o serviço imediatamente. `ExecReload` atua em todos os apps daquele PM2_HOME.

**[INFERIDO]** Dependência em docker.service não garante PostgreSQL pronto. Unit não implementa readiness da aplicação; PATH do Node, permissões e reboot precisam ser testados. Compartilhar PM2_HOME com outros aplicativos amplia alcance de `reload all`.

## Tenant kit

**[CONFIRMADO]** `deploy:init` ajuda criar tenant; `deploy:render` escreve kit em `deploy/out/<slug>`; `--apply-root-env` sobrescreve env raiz; `--publish-tools` publica ferramentas locais. `deploy:server:up` aplica env mesmo sem flag, sobe infra, instala/migra/builda e inicia PM2 conforme `RUN_PROXY_MODE`.

**[CONFIRMADO]** `deploy/tenant.permetal.example` é exemplo preparado para host `bashchat`, IP 192.168.2.4, admin HTTPS false e caminho de updates **Windows** `C:\caddy\updates\desktop\win`. Não é configuração Linux pronta. O `deploy/tenant.env` local usa slug `bashchat-interno`, não `permetal`.

**[PLANEJADO]** Antes de gerar kit Linux, definir paths Linux, conta de serviço, domínios/IP, URL admin, destino/feed desktop, DB/segredos e estratégia TLS. Corrigir divergência tenant/Compose para banco antes de tratar parâmetros `DB_*` como efetivos.

## Portas e serviços pretendidos

| Porta | [CONFIRMADO] uso em código | [PLANEJADO] tratamento no servidor |
|---|---|---|
| 80/TCP | Nginx exemplo redireciona HTTPS | Definir necessidade e política de rede. Caddy local tem redirect desabilitado. |
| 443/TCP | HTTPS no proxy | Entrada de navegador/Electron conforme domínio/CA aprovados. |
| 3000/TCP | API/Socket.IO Node | Preferir acesso interno/loopback atrás de proxy, após ajuste do bind atual. |
| 5173/TCP | Chat Vite/preview | Interno ao proxy, ou servir dist diretamente por servidor de arquivos adequado. |
| 5174/TCP | Admin Vite/server.cjs | Decidir admin HTTPS/rede restrita; exemplo tenant usa HTTP direto. |
| 5432/TCP | PostgreSQL publicado no Compose | Restringir ao consumidor necessário; não expor livremente na LAN/Internet. |
| 6379/TCP | Redis publicado no Compose | Revisar necessidade real e exposição; código não usa Redis atualmente. |
| SSH | Nenhuma porta/configuração no projeto | [DESCONHECIDO] Forma/porta/autorização de acesso ao Linux. |

**[PLANEJADO]** Não adotar números/IPs internos antigos como destino do novo servidor sem confirmar. DNS/hosts do notebook e configuração do firewall são camadas externas ao Git.

## O que falta antes de uma implantação real

- **[PLANEJADO]** Definir topologia: híbrida existente ou totalmente conteinerizada. Isso determina build, persistência, rede e supervisão.
- **[PLANEJADO]** Preparar máquina Linux, acesso, Node compatível, Docker/Compose, usuário de serviço, paths e timezone. A agenda de mídia usa horário local.
- **[PLANEJADO]** Resolver credenciais fixas Compose, CORS, exposição das portas, políticas auth/anexos e configuração Vite.
- **[PLANEJADO]** Instalar/validar proxy e certificados; projetar renovação, confiança dos clientes e canal de updates. Não há automação Linux completa para essas etapas.
- **[PLANEJADO]** Implementar backup/restore/rollback, healthchecks, readiness, rotação de logs, monitoramento de disco/certificados e critérios de aceite.
- **[PLANEJADO]** Homologar migrations e fluxos de negócio com dados de teste isolados, incluindo grupos/listas, desfazer, não lidas, áudio/anexos e retenção.

**[DESCONHECIDO]** CPU/RAM/disco dimensionados, quantidade de usuários, SLA, RPO/RTO e responsáveis por backup/certificados. Não há base para declarar capacidade ou disponibilidade garantidas.
