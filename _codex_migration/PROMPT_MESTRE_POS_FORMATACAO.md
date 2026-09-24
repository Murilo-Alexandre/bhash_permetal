# SUPER PROMPT — continuidade do BHASH

Copie a partir da linha seguinte para um novo Codex com acesso ao repositório e a esta pasta. Os arquivos privados devem ser restaurados por meio seguro, nunca colados no prompt.

---

Você está continuando o projeto **BHASH**, mensageiro corporativo on-premise. Não dependa de memória de outra conversa. Use o código, os dados disponíveis e a documentação `_codex_migration/` como fontes verificáveis, distinguindo snapshot antigo do estado que encontrar agora.

## Restrições e classificação

O proprietário declarou que o projeto **AINDA NÃO ESTÁ EM PRODUÇÃO**. Há ambiente local e preparação de deploy; não documente intenção/script/template como operação produtiva. `NODE_ENV=production`, HTTPS local, build `dist` e scripts “deploy” não alteram essa condição.

Na auditoria original foi autorizado apenas ler e escrever os 13 Markdown desta pasta. Código, infraestrutura, certificados, deploy, commit e push estavam proibidos. **Comece em leitura**; não execute restauração, seed, migration, scripts de startup/release ou mudanças enquanto o escopo atual do proprietário não autorizar a próxima etapa. Se ele já autorizar recuperação/desenvolvimento local, avance dentro desse escopo, sem pedir novamente autorização para cada passo rotineiro. Isso não autoriza Linux/produção ou publicação automaticamente.

Use sempre:

- **[CONFIRMADO]** evidência direta ou declaração explícita, delimitando se é código, arquivo ou runtime.
- **[PLANEJADO]** ação/arquitetura futura, ainda não realizada.
- **[INFERIDO]** dedução fundamentada que precisa ser testada.
- **[DESCONHECIDO]** informação ausente/não testada.

Nunca reproduza senhas, tokens, chaves privadas, conteúdo do `.env` real, dump PM2 completo ou payloads privados. Inventarie nomes/paths e metadados públicos. Proteja os dados originais e não use operações destrutivas como tentativa de diagnóstico.

## Documentação e versão de referência

Leia `00_LEIA_PRIMEIRO.md`, `01_CONTEXTO.md`, `02_ARQUITETURA.md`, `03_DOCKER_LOCAL.md`, `04_GIT.md`, `05_INFRAESTRUTURA_LINUX_PLANEJADA.md`, `06_CERTIFICADOS_E_HTTPS.md`, `07_DEPLOY_PLANEJADO.md`, `08_DADOS_PERSISTENTES.md`, `09_ESTADO_ATUAL.md`, `10_TROUBLESHOOTING.md` e `11_POS_FORMATACAO.md`. Confira instruções AGENTS que existirem na máquina nova.

Snapshot auditado: 24/09/2026, Windows, `C:\dev\bhash`, branch `main`, HEAD **`1a729f98607026804998ff11d14e89dfd24861aa`**, commit 02/04/2026 “Acerto menu dados do usuário”. Origin `https://github.com/Murilo-Alexandre/bhash_permetal.git`. ls-remote confirmou main nesse SHA na auditoria. GitHub CLI não estava autenticada; PRs/proteções/visibilidade não foram confirmados. Nenhum workflow CI versionado encontrado.

Working tree estava limpa antes da documentação. Esta pasta foi criada **sem commit/push**; novo clone pode não trazê-la. Não sobrescreva trabalho novo nem faça reset para reproduzir snapshot sem avaliar divergências.

## O que já existe

1. Backend NestJS 11/TypeScript/Prisma 7.3/PostgreSQL, JWT/Argon2 e Socket.IO. Backend no host, cwd `backend`, artefato observado `dist/src/main.js`.
2. Chat React 19/Vite 7 e painel admin React/Vite separados, portas 5173/5174. Usuários e admins são tabelas/identidades distintas. API/WS 3000, API pública do proxy com prefixo `/api`, socket `/socket.io`.
3. Cliente Electron Windows aplicativo 0.1.3, que abre URL web, tem tray/notificações/autostart/downloads/updater. Não contém servidor próprio. Existem instaladores locais; distribuição real não confirmada.
4. Conversas diretas, grupos, listas de transmissão, mídia/áudio, respostas, favoritos, reações, não lidas, pin, limpeza/ocultação pessoais, admin de usuários/empresas/setores/branding/histórico.
5. Grupos com admins, saída/remoção/exclusão e histórico; listas do proprietário que geram cópias nas conversas diretas. Regras automáticas empresa+setor: AND no par, OR entre pares; busca textual não define regra futura; zero regras com inclusão automática vale para todos. Sincronização de grupo adiciona elegíveis, não remove automaticamente quem deixa de corresponder.
6. Schema com 17 models e 22 migrations; última `20260331133000_group_automatic_rule_pairs`. Aplicação delas no banco real era desconhecida.
7. Compose contém **somente postgres:16 e redis:7**, containers `bhash-postgres`/`bhash-redis`, portas 5432/6379, restart unless-stopped. Sem Dockerfile/app services/build/healthchecks.
8. PM2 normal/proxy, scripts Windows/Linux, tenant kit, template Nginx e configuração Caddy real externa.

## Como funciona o Docker local

Não diga que `docker compose up` sobe o app inteiro. Ele sobe banco/Redis; Node roda backend/chat/admin no host.

Volume PostgreSQL real **`bhash_bhash_pg`** → `/var/lib/postgresql/data`; rede **`bhash_default`**. Nome do projeto/pasta influencia nome do volume. Redis tinha volume anônimo montado em `/data`, sem política de persistência no Compose; não foi encontrada utilização no backend.

Na auditoria ambos containers estavam parados desde 02/09/2026. Frontends/Caddy e tarefas Windows ainda existiam; dump PM2 “online” não provava saúde. Porta 3000 pertencia ao frontend Docker de outro projeto (`meethub_frontend`), e logs backend continham ECONNREFUSED. Reinspecione isso; não desligue serviços alheios sem escopo.

Runtime observado: Node 24.15.0/npm 11.12.1; Docker 29.6.2/Compose 5.3.1, contexto desktop-linux/WSL2. Vite exige `^20.19.0 || >=22.12.0`. Há locks separados para raiz/backend/chat/admin/desktop; `install:all` não inclui desktop.

## Recuperação: primeiro dados, depois aplicação

Antes de iniciar qualquer backend, determine se existe backup de **banco+uploads+configuração/TLS**. Clone Git NÃO recupera isso. A auditoria não criou backups e não validou restore.

Uploads são toda `backend/public/uploads`, incluindo arquivos na raiz, `chat`, `chat-audio`, `avatars`, `conversation-avatars`, `chat-media` e legados. Banco contém URLs/metadados, não bytes. Restore deve manter coerência e cwd backend.

**CRÍTICO:** a política chamada “backup de arquivos” na UI é limpeza destrutiva sem backup e sem filtro de idade. Scheduler pode rodar ao inicializar; `GET /admin/history/retention-policy` também pode disparar a limpeza. Não use esse GET/E2E/bootstrap como auditoria de leitura. Um PM2 em retry pode iniciar app assim que PostgreSQL voltar; isole app/boot antes de ligar banco preservado. Leia política por SQL read-only conforme 08 antes de iniciar banco restaurado com aplicação.

Seed faz upsert, redefine hashes e pode reativar contas. **Não executar seed sobre restore indiscriminadamente.** Migrations não criam contas iniciais; seed é ramo deliberado de banco vazio. `setup:server` instala/migra/builda; não é simples inspeção.

Quando recuperação LOCAL estiver autorizada, siga 11 por etapas e confira resultados. **Antes do bloco abaixo, restaure ou configure de forma privada o `.env` da raiz**, especialmente `DATABASE_URL` e `JWT_SECRET`; Prisma precisa da URL já na leitura de sua configuração. Não aplique o tenant divergente para preencher isso automaticamente:

```powershell
Set-Location C:\dev\bhash
git status --short --branch
git rev-parse HEAD
docker context show
docker compose ps -a
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm --prefix backend ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm --prefix frontend ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm --prefix frontend-admin ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm run prisma:generate
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

Depois escolha **um** ramo:

- **Banco anterior:** manter app desligada, restaurar dump em banco novo/vazio ou recuperar volume original conforme 08; restaurar uploads/env; ler política e migrations; aplicar migrations pendentes somente após revisão/backup. Não seed.
- **Banco vazio deliberado:** `npm run infra:up`, esperar `pg_isready`, `npm run prisma:migrate:deploy`; seed explícito somente com credenciais privadas revisadas e aceitação das contas de teste.

Com banco pronto, retenção tratada e portas livres: `npm run dev:all`; chat HTTP localhost 5173/admin 5174. Não rodar dev e PM2 simultaneamente. Caddy/HTTPS/Electron são etapas separadas. Não usar `down -v`, prune, reset Docker ou remoção de volume. No Windows, evitar redirecionar dump binário pelo PowerShell: o roteiro grava dump no container e copia com docker cp.

## Env e TLS: três configurações diferentes

- Raiz `.env` e `C:\caddy\Caddyfile` reais: `bhash.condominious`, `admin-bhash.condominious`, `updates.bhash.com`; hosts local apontava para 192.168.1.137.
- `deploy/tenant.env`/`deploy/out/bashchat-interno`: host `bashchat`, IP 192.168.2.4, admin HTTP 5174, canal `/desktop/win`, paths Windows.
- `deploy/tenant.permetal.example`: exemplo versionado de preparação Permetal, não estado produtivo.

Não aplicar o tenant local sobre env real sem reconciliar intenção. `deploy:server:up` sobrescreve raiz; `render:apply` também. Credenciais PostgreSQL no Compose são fixas e não acompanham `DB_*` do tenant. Os Vite configs carregam env pelo cwd do módulo sem envDir raiz; não supor que VITE_* raiz chegou ao build. Defaults Electron vêm da raiz; release tenant pode publicar artefato com endpoints divergentes.

Certificados reais estavam fora do Git, em `C:\Users\INFORMATICA2\AppData\Roaming\Caddy`: raiz/intermediária em `pki\authorities\local`, folhas/chaves/metadados em `certificates\local\<host>`. Chaves não foram lidas. Thumbprint público CA raiz `CC47857178555EFC919B7A88881D81169A7937BF`, instalada no trust store usuário/máquina; validades inventariadas em 06. Não considerar isso prova da cadeia servida pelo processo SYSTEM.

Tarefa Caddy roda SYSTEM e não fixa data-dir; storage em systemprofile teve acesso negado. Preservar identidade CA correta antes de formatar e antes de instalar tarefas na máquina nova. Não gerar outra CA por engano. Distribuir somente CA pública aos clientes. Backup antigo `C:\caddy\cert-backup-20260317-154933` é incompleto/expirado.

Caddy real usa emissor local e redirect HTTP desabilitado. Renovação automática pretendida não foi testada. Nginx Linux só referencia cert/key; não existe processo de renovação Linux versionado. Electron aceita certos erros TLS: isso é pendência de revisão, não prova de confiança correta.

## Onde retomar o desenvolvimento

O último pedido verificado foi 02/04/2026: manter ordenação ao limpar conversa, eliminar piscadas, toast menor/alto e contador dentro do spinner. **Esses ajustes estão em HEAD.** Fontes: ChatPage.tsx: 4152/4559/6547/10058; index.css: 4479. Resposta histórica relatou build frontend aprovado e pediu teste; não foi encontrada confirmação posterior do usuário. Não reimplemente automaticamente. Valide limpar com/sem favoritos, desfazer, eventos novos, refresh e diferentes viewports em cópia controlada.

Grupos/listas e regras pareadas estão implementados, mas existe suspeita fundamentada no envio de broadcast: `assertMember` em messages.service não seleciona `automaticRules` usado no cálculo da audiência; pode cair no fallback antigo. É [INFERIDO], ainda não falha reproduzida. Validar com teste significativo. Anexo broadcast compartilha URL entre cópias; exclusão de uma mídia pode afetar outras.

Testes backend estão defasados (spec com implementação antiga sem teste, expectativas HelloWorld, dependências ausentes). E2E conecta AppModule real com retenção. Não executar contra dados originais. Front/admin/desktop não têm suíte encontrada. Não declarar testes atuais aprovados com base no histórico.

## Como continuar preparando deployment Linux

Fluxo **já preparado**: local → Git/GitHub → clone/pull Linux → Docker PostgreSQL/Redis → npm/Prisma/build no host → PM2 Node → Nginx HTTPS → aplicação. Servidor real, SSH/DNS/firewall e execução desse fluxo continuam desconhecidos.

Se o proprietário quer **build → containers de aplicação → HTTPS**, ainda precisa construir Dockerfiles/Compose completo, redes, volumes de uploads, healthchecks/readiness, config/secrets, execução de migrations, build/release por versão e supervisão. Não invente que isso existe.

No plano híbrido, scripts Linux atuais usam PM2 normal; modo proxy fixa backend/admin 0.0.0.0, apesar de docs antigos dizerem loopback. `/opt/bhash` é path previsto; unit systemd restaura PM2, sem garantir prontidão do banco. Nginx tem 40 MiB versus app 250 MiB e não gera feed desktop. Completar TLS/renovação, distribuição de cliente, paths Linux, CORS/portas, saúde/logs, backup/restore/rollback antes de homologação.

Prioridades pré-produção incluem preservar dados; rever retenção chamada backup; remover exposição de senhas lembradas em localStorage; definir acesso aos anexos públicos; revisar revogação WS/auth/TLS Electron; resolver credenciais Compose/configs divergentes; validar regras/testes; ensaiar restauração e rollback. Não houve correção dessas pendências na auditoria.

Backup deve combinar dump PostgreSQL + uploads coerentes + env/proxy/TLS protegidos, em destino externo, com verificação de restore. Rollback de commit não desfaz schema/dados. Manter release anterior e snapshot consistente; estratégia ainda não implementada. Retenção de anexos não é backup.

## Primeira resposta e método esperado

Faça inspeção de leitura e relate: versão/estado atual; quais backups/configs privados existem; o que mudou desde o snapshot; riscos imediatos de recuperação; próximo passo dentro do escopo já autorizado. Não exponha segredos nem declare produção. Avance autonomamente no trabalho autorizado e valide o resultado; peça somente informação realmente ausente que bloqueie decisão material.

Ao encerrar cada etapa, atualize este pacote com evidências, comandos realmente executados, resultados e pendências, mantendo a separação entre implementado, preparado, inferido e desconhecido. Um novo Codex deve conseguir continuar sem depender desta conversa.
