# Estado atual e ponto verificável de parada

## Foto da auditoria

**[CONFIRMADO]** Data 24/09/2026; branch main; HEAD `1a729f98607026804998ff11d14e89dfd24861aa`; remoto main confirmado no mesmo SHA por ls-remote. Working tree estava limpa antes desta pasta. Nenhum deploy/commit/push efetuado nesta tarefa.

**[CONFIRMADO]** O projeto ainda não está em produção, conforme proprietário. Código, templates e runtime local são fontes distintas de evidência.

| Camada | Estado observado |
|---|---|
| Fonte | [CONFIRMADO] Último commit 02/04, grupos/listas e refinamentos de UI já implementados. |
| Banco/Redis | [CONFIRMADO] Containers existem/parados desde 02/09; volume PG existe. Conteúdo/migrations [DESCONHECIDO]. |
| Aplicação host | [CONFIRMADO] Dump PM2 registra 3 apps; listeners 5173/5174; backend log contém ECONNREFUSED. Saúde [DESCONHECIDO]. |
| Conflito | [CONFIRMADO] Porta 3000 publicada pelo frontend de outro projeto Docker (`meethub_frontend`). |
| Caddy | [CONFIRMADO] Processo 443/config/certificados/tarefa locais encontrados. Cadeia efetivamente servida [DESCONHECIDO]. |
| Builds | [CONFIRMADO] backend dist 02/04, chat dist 02/04, admin dist 31/03. Correspondência completa ao HEAD não comprovada por mtime. |
| Desktop | [CONFIRMADO] app 0.1.3 e instaladores locais/kit 25/03; distribuição/clientes ativos [DESCONHECIDO]. |
| Linux | [CONFIRMADO] Scripts/modelos disponíveis. Execução real [DESCONHECIDO]. |

## Onde o desenvolvimento parou

**[CONFIRMADO]** Histórico relevante encontrado fora do Git:

`C:\Users\INFORMATICA2\.codex\sessions\2026\03\27\rollout-2026-03-27T10-52-29-019d2f91-5fc8-7bc0-adac-237278105484.jsonl`

**[CONFIRMADO]** Último pedido nesse histórico: **02/04/2026 15:30:51UTC (12:30:51 -03)**. Solicitava manter a ordem da conversa após limpar, evitar piscadas/refresh visual, reduzir/subir o aviso e colocar timer dentro do círculo de loading.

**[CONFIRMADO]** Última resposta,15:38:47UTC, relata implementação e build frontend aprovado, e pede ao usuário recarregar/testar. **[DESCONHECIDO]** Não há confirmação posterior do usuário nesse arquivo. A alegação histórica de build não foi reexecutada nem convertida em validação atual.

| Pedido final | [CONFIRMADO] evidência no HEAD |
|---|---|
| Posição ao limpar | ChatPage.tsx: 4152 preserva sortAt do snapshot e usa preserveSort. |
| Refresh sem loading visível | ChatPage.tsx: 4559 implementa silent; sincronização Socket em: 6547 usa silent:true. |
| Timer no spinner | ChatPage.tsx: 10058, timerValue dentro timerSpinner. |
| Toast compacto/acima | frontend/src/index.css: 4479 bottom 96px, largura máxima 380px; padding 10×12px; spinner 34px. |
| Confirmação/desfazer | ChatPage.tsx conserva atualização otimista e finalização em 5 s. |

**[CONFIRMADO]** Esses arquivos estão iguais ao HEAD segundo git diff de leitura. **[INFERIDO]** Próximo passo funcional correto é validar o último pedido com/sem favoritos, desfazer, eventos novos, refresh e viewport diferente; não reimplementar a partir do título do commit.

**[CONFIRMADO]** TopNav ainda mostra Logoff, e a engrenagem separada abre “Minhas informações”. Não há menu novo de avatar de usuário no TopNav. Não interpretar “Acerto menu dados do usuário” como mudança adicional não presente.

## Contexto histórico complementar

**[CONFIRMADO]** Histórico 25/03 registra correções de limpar conversa, não lidas reaparecendo após refresh e largura de card de contato. Histórico 13/03 discute instalador futuro de servidor/DNS e distingue cliente/servidor. Sessões relevantes para preservação opcional:

- `2026/03/25/rollout-2026-03-25T10-40-00-019d2539-392f-7e90-9244-8570320803eb.jsonl`
- `2026/03/13/rollout-2026-03-13T12-22-13-019ce7ca-7dfe-78b0-9782-0e8e449ce154.jsonl`

**[CONFIRMADO]** Esses caminhos são relativos a `C:\Users\INFORMATICA2\.codex\sessions`. A síntese necessária está neste pacote; não é necessário depender da memória ou restaurar histórico inteiro para compreender a continuidade. Sessões de outros projetos que só mencionam BHASH não foram usadas para afirmar mudanças no BHASH.

## Migrations e testes

**[CONFIRMADO]** Há 22 migrations, de `20260205104906_init` a `20260331133000_group_automatic_rule_pairs`. Etapas recentes incluem áudio, grupos/broadcast, detalhes/audiências, permissões admin de grupo, motivo de saída e pares de regras automáticas. **[DESCONHECIDO]** Quais estão aplicadas ao banco local/remoto.

**[CONFIRMADO]** Specs backend não representam suíte validada: `conversations.service.spec.ts` contém implementação antiga sem testes; vários specs só esperam “defined” sem dependências; app specs esperam Hello World enquanto AppService retorna HTML. E2E inicializa AppModule/banco/scheduler reais. Não foram executados por serem inadequados à auditoria estritamente de leitura.

**[CONFIRMADO]** Não há specs/scripts de teste frontend/admin/desktop encontrados. Nenhum build/lint/test/install executado nesta tarefa. Backend lint inclui `--fix` e format escreve arquivos; também foram evitados.

**[CONFIRMADO]** Nenhum marcador literal TODO/FIXME/HACK/XXX foi localizado nos fontes/scripts/docs pesquisados. Há comentário de melhoria no editor de usuários para filtrar setores por empresa (`AdminUsersPage.tsx:734`). Falta de TODO não significa projeto concluído.

## Pendências materiais, sem correção nesta auditoria

| Prioridade | Estado | Pendência e implicação |
|---|---|---|
| Preservação | [DESCONHECIDO] | Backup externo restaurável não demonstrado; documentação não preserva volume/segredos sozinha. |
| Preservação | [CONFIRMADO] | Rotina chamada backup apaga mídia; startup/GET política podem disparar. Examinar antes de restaurar/subir app. |
| Retomada | [CONFIRMADO] | PostgreSQL parado, porta 3000 conflita, logs backend grandes; ambiente não deve ser chamado saudável. |
| Retomada | [CONFIRMADO] | .env real, tenant/kit e Caddy divergem; render/apply sobrescreveria parâmetros. |
| Funcional | [INFERIDO] | `messages.service.ts:139–174` não seleciona automaticRules no objeto consumido em: 495/: 648; broadcast pode cair no fallback e perder semântica de pares. Precisa teste. |
| Funcional | [INFERIDO] | Broadcast compartilha URL; apagar uma mídia pode quebrar outras referências. |
| Funcional | [DESCONHECIDO] | Última UX implementada ainda sem homologação posterior encontrada. |
| Segurança | [CONFIRMADO] | Lembrar login armazena senha em localStorage nos dois frontends. |
| Segurança | [CONFIRMADO] | /static público; verificar política de confidencialidade dos anexos. |
| Segurança | [CONFIRMADO] | Electron aceita erros TLS e usa sandbox:false; revisar confiança/IPC. |
| Segurança | [CONFIRMADO] | HTTP e WS diferem na checagem de usuário ativo; CORS LAN aceita hosts genéricos; política de senha/troca diverge. |
| Infra | [CONFIRMADO] | Credenciais Compose fixas, portas amplas, sem healthchecks; app sem Dockerfiles. |
| Infra | [CONFIRMADO] | Scripts Linux modo normal versus docs proxy; binds backend/admin não são loopback. |
| Infra | [CONFIRMADO] | Nginx 40 MiB versus upload 250 MiB; feed desktop ausente no gerador Nginx. |
| Infra | [CONFIRMADO] | Sem backup/restore/rollback/renovação Linux implementados e ensaiados. |
| Build | [INFERIDO] | Env Vite da raiz pode não ser carregado; defaults Electron tenant podem vir da raiz divergente. |
| Qualidade | [CONFIRMADO] | Testes defasados e sem CI versionado; aceitação integrada pendente. |

**[INFERIDO]** Outros pontos a avaliar com testes: nome de upload baseado apenas em timestamp pode colidir; exclusão física de usuário com relações obrigatórias pode falhar; múltiplas instâncias não coordenam presença/retenção. Não foram tratados como falhas reproduzidas.

## Ordem sugerida de continuidade

**[PLANEJADO]** Preservar/verificar backup → reconstruir local de modo controlado → homologar último fluxo → corrigir riscos de dados/auth comprovados e validar suspeitas → decidir topologia Linux → completar pipeline/proxy/TLS/dados/rollback → homologar servidor → considerar produção somente por instrução explícita e com evidência.
