# Contexto funcional e decisões

## Propósito

**[CONFIRMADO]** BHASH é um mensageiro corporativo on-premise: chat para usuários, administração separada e cliente desktop Windows que abre a aplicação web. Empresas/setores organizam usuários e audiências. Não foi encontrado um produto SaaS com isolamento entre tenants dentro do mesmo banco; o tenant kit prepara configurações de instalações. Fontes: `README.md`, `backend/prisma/schema.prisma`, `scripts/deploy/lib/tenant-config.cjs`, `desktop-electron/src/main.js`.

**[CONFIRMADO]** Nesta auditoria o proprietário priorizou preservar contexto para futura formatação e preparar continuidade do deployment Linux, sem implantar ou alterar o produto. O projeto ainda não está em produção.

## Superfícies e identidades

| Superfície | [CONFIRMADO] finalidade |
|---|---|
| `frontend` | Login, troca inicial de senha, diretório de contatos e chat. |
| `frontend-admin` | Login administrativo, usuários, empresas/setores, cores/logos, histórico e política de mídia. |
| `desktop-electron` | Janela para a URL web, tray, autostart, notificações, downloads e auto-update Windows. Depende do servidor. |
| `backend` | API HTTP, autenticação, autorização, persistência, arquivos e eventos Socket.IO. |

**[CONFIRMADO]** `users` e `admin_accounts` são identidades diferentes. JWTs distinguem `user`/`admin`; superadmin é flag administrativa. Tokens de chat/admin são guardados separadamente. Não assumir que o login de usuário funciona no painel admin.

**[CONFIRMADO]** A UI exige troca inicial quando `mustChangePassword`/`mustChangeCredentials` está marcado. Os guards não aplicam uma restrição geral equivalente a todos os endpoints; essa distinção precisa de revisão. Senhas têm mínimos inconsistentes entre criação/reset e troca inicial. Fontes: `frontend/src/App.tsx:51`, `frontend-admin/src/App.tsx:100`, `backend/src/auth/jwt.strategy.ts:18`, `backend/src/admin/admin-users.controller.ts`.

## Regras de conversação a preservar

- **[CONFIRMADO] Conversa direta:** par normalizado único de usuários; leitura e estado pessoal não devem reaparecer como não lidos após refresh. Histórico de março registra correções exatamente nessa área.
- **[CONFIRMADO] Grupo:** título, avatar, participantes e administradores. Criador vira admin. Último admin não pode deixar os demais sem administrador. Há adicionar/remover/promover/rebaixar, sair e excluir.
- **[CONFIRMADO] Grupo encerrado/saída:** razões `LEFT`, `REMOVED`, `GROUP_DELETED` ficam registradas. Histórico pode continuar visível, mas envio é bloqueado. Grupo ativo deve ser deixado antes de ser removido da lista pessoal.
- **[CONFIRMADO] Lista de transmissão:** gerenciada pelo proprietário; envia cópias para conversas diretas dos destinatários, mantendo referência à origem. Não é grupo com vários admins/saída de participante.
- **[CONFIRMADO] Lista ativa não pode simplesmente desaparecer da sidebar:** deve ser excluída primeiro; depois pode ficar em modo histórico e ser removida da lista de chats. Regra pedida pelo usuário em 02/04 e presente em `conversations.service.ts:1672`.
- **[CONFIRMADO] Audiências automáticas:** AND entre empresa e setor no mesmo par; OR entre pares. Seleções explícitas somam-se à audiência, aplicando exclusões. Busca textual serve para seleção imediata, não para regra automática futura. “Incluir novos usuários” sem regras significa todos os novos usuários.
- **[CONFIRMADO] Sincronização de grupos:** criar/editar usuário adiciona elegíveis; não há remoção simétrica automática de quem deixou de satisfazer regra. Saídas/exclusões explícitas são respeitadas.
- **[INFERIDO]** O envio de broadcast pode não carregar `automaticRules` e cair em lógica antiga empresa OU setor. Validar antes de alterar essa área; ver 09.

Fontes centrais: `backend/src/conversations/conversations.service.ts:423`, `:597`, `:1159`, `:1398`, `:1542`; `backend/src/messages/messages.service.ts:495`, `:647`; `frontend/src/pages/ChatPage.tsx:2316`, `:5972`.

## Mensagens e estado pessoal

**[CONFIRMADO]** Há texto, imagem, arquivo/áudio e previews de vídeo/documentos, respostas, busca, paginação, favoritos, reação por usuário, fixação, status de leitura e sincronização em tempo real. UI permite desfazer certas ações durante cinco segundos antes da confirmação remota. Limpeza pode preservar favoritos.

**[CONFIRMADO]** “Excluir mensagem” para usuário é ocultação individual (`message_visibility`); não é exclusão global do registro/arquivo. “Limpar conversa” usa estado pessoal `clearedAt`/visibilidade. Admin possui histórico mais amplo. Não igualar histórico do usuário ao histórico administrativo.

**[CONFIRMADO]** A última solicitação de UX encontrada pede: manter posição da conversa ao limpar; não piscar/forçar refresh da tela; avisos compactos acima da digitação; contador dentro do círculo de loading. Ver rastreio em 09. O título do último commit “Acerto menu dados do usuário” não descreve todas essas alterações.

## Administração e arquivos

**[CONFIRMADO]** Gestão inclui nome/contato/ramal/avatar, empresa/setor, ativação, senha, identidade visual, logos e consulta ao histórico. Empresas/setores com usuários vinculados não podem ser excluídos. Listagens de contatos filtram usuários ativos e excluem o próprio usuário.

**[CONFIRMADO]** Bytes de anexos/avatares/logos vivem em filesystem; banco contém metadados e URLs. Mídia não acompanha clone Git. A rota `/static` é pública no código atual. Broadcast reaproveita a URL física do anexo em múltiplas mensagens.

**[CONFIRMADO]** “Backup de arquivos” na UI é nome inadequado para retenção destrutiva: o backend apaga anexos e limpa metadados, sem gerar arquivo de backup e sem filtro de idade na seleção atual. Sua agenda usa horário local do processo. Esse comportamento é prioridade de preservação de dados, não infraestrutura de backup pronta.

## Desktop/PWA

**[CONFIRMADO]** Electron aplicativo 0.1.3 contém cliente web e updater generic. Não instala PostgreSQL/backend no desktop do usuário. Feed usa instalador `.exe`, `.blockmap` e `latest.yml`. Existem artefatos locais, sem comprovação de distribuição funcionando.

**[CONFIRMADO]** Chat possui manifesto e service worker; Electron desregistra esse SW e limpa seus caches. Notificações observadas são disparadas pela página ou bridge Electron. **[INFERIDO]** Não há evidência de web push com navegador fechado.

## Contexto histórico disponível

- **[CONFIRMADO]** 10–12/03: preparação PM2/Linux, HTTPS interno, Electron, tenant kit e atualização desktop.
- **[CONFIRMADO]** Histórico de 13–16/03 discutiu um futuro instalador completo de servidor Windows e DNS via firewall. Isso era intenção; scripts/kit e instalador de CLIENTE não comprovam instalador universal de servidor pronto.
- **[CONFIRMADO]** 25/03: commit de preparação Permetal. Exemplo versionado: IP `192.168.2.4`, host `bashchat`, admin HTTP, DNS planejado externo ao app.
- **[CONFIRMADO]** 27/03–02/04: grupos/listas, regras automáticas, dados de grupo/lista, leitura, ações de limpeza/exclusão e ajustes visuais.
- **[CONFIRMADO]** 24/09: pedido atual de documentação para formatação; servidor Linux é preparação futura, não produção existente.

**[DESCONHECIDO]** Aceitação funcional final pelo usuário, backlog completo fora das fontes/históricos encontrados e servidor destino definitivo. Não converter perguntas antigas, sugestões de assistentes ou arquivos de exemplo em decisões de produção.
