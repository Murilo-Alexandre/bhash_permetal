# BHASH — continuidade após formatação

Auditoria realizada em **24/09/2026**, no notebook Windows, em `C:\dev\bhash`. Referência do código: branch `main`, commit **`1a729f98607026804998ff11d14e89dfd24861aa`**, de 02/04/2026. Os caminhos e estados de máquina abaixo são um retrato dessa data.

## A distinção que deve sobreviver à formatação

- **[CONFIRMADO] O BHASH ainda NÃO está em produção**, conforme declaração explícita do proprietário nesta tarefa.
- **[CONFIRMADO]** Existe ambiente local híbrido: PostgreSQL e Redis em Docker; backend NestJS e interfaces React executados no Windows por Node/PM2 ou Vite em desenvolvimento.
- **[CONFIRMADO]** Existem scripts, modelos de configuração e documentação para implantação Linux. Isso comprova preparação, não implantação realizada.
- **[CONFIRMADO]** Não há Dockerfile nem serviço de backend/frontend/admin no Compose auditado. Um clone Git não sobe a aplicação inteira em containers.
- **[DESCONHECIDO]** Não foi verificado nenhum servidor Linux remoto. IP, distribuição, acesso SSH, DNS definitivo e operação nesse servidor continuam sem comprovação.

## Legenda obrigatória

| Marcador | Significado neste pacote |
|---|---|
| [CONFIRMADO] | Evidência direta no código, arquivo, Git, metadados locais ou declaração explícita do usuário; não significa teste funcional aprovado. |
| [PLANEJADO] | Procedimento futuro ou proposta deste pacote; não executado pela auditoria. |
| [INFERIDO] | Conclusão plausível a partir das evidências, ainda sujeita a verificação. |
| [DESCONHECIDO] | Informação não disponível, não acessível ou não testada. |

## Leitura recomendada

1. [Contexto e regras de negócio](01_CONTEXTO.md).
2. [Arquitetura e dependências](02_ARQUITETURA.md).
3. [Docker local e serviços](03_DOCKER_LOCAL.md).
4. [Git e GitHub](04_GIT.md).
5. [Infraestrutura Linux preparada](05_INFRAESTRUTURA_LINUX_PLANEJADA.md), [TLS](06_CERTIFICADOS_E_HTTPS.md) e [fluxo de deploy](07_DEPLOY_PLANEJADO.md).
6. [Dados, backup e restauração](08_DADOS_PERSISTENTES.md).
7. [Ponto de parada e pendências](09_ESTADO_ATUAL.md), [troubleshooting](10_TROUBLESHOOTING.md).
8. [Roteiro pós-formatação](11_POS_FORMATACAO.md).
9. Entregar ao próximo Codex o [PROMPT MESTRE](PROMPT_MESTRE_POS_FORMATACAO.md), junto com esta pasta e o repositório.

## O que não pode ser perdido

**[CONFIRMADO]** GitHub não contém os dados PostgreSQL, uploads, `.env` real, `deploy/tenant.env`, kit gerado, CA/chaves Caddy, perfis locais e esta documentação ainda não commitada. Reinstalar dependências recompõe software; não recompõe esses dados.

**[PLANEJADO]** Antes de formatar, preservar em destino protegido fora do notebook:

- Banco do volume Docker **`bhash_bhash_pg`**, idealmente dump validado e cópia física consistente complementar.
- **Toda** a pasta `backend/public/uploads`, incluindo logos na raiz e diretórios atuais/legados.
- `.env`, `frontend/.env.https`, `frontend-admin/.env.https`, `deploy/tenant.env` e kit `deploy/out/bashchat-interno`.
- `C:\caddy\Caddyfile`, `C:\caddy\updates` e o data-dir completo do Caddy, incluindo a identidade privada da CA, em armazenamento confidencial. Nunca colocar chaves/senhas no Git ou nesta documentação.
- Código/Git, `_codex_migration`, eventual patch `.temp/broadcast-sidebar.patch` e configurações locais relevantes.

**[CONFIRMADO] Nenhum backup foi criado por esta auditoria. [DESCONHECIDO] Não há comprovação de backup externo restaurável.** Não tratar a existência deste pacote como liberação para apagar o notebook.

## Alertas concretos para a retomada

- **[CONFIRMADO]** Os containers BHASH estavam parados desde 02/09/2026. Há processos locais de frontend/Caddy e tarefas de boot; isso não prova aplicação saudável. A porta 3000 estava ocupada por outro projeto Docker.
- **[CONFIRMADO]** A configuração real `.env`/Caddy usa `bhash.condominious`; o tenant local gerado usa `bashchat`. `deploy:server:up` sobrescreve `.env`: não usá-lo como restauração neutra.
- **[CONFIRMADO]** A função de interface chamada “backup de arquivos” implementa **exclusão de anexos**, sem cópia de segurança. Iniciar backend ou ler a política pela API pode dispará-la se estiver vencida. Ver capítulos 08 e 11 antes de iniciar banco restaurado com a aplicação.
- **[CONFIRMADO]** Seed pode redefinir senhas e reativar contas existentes. Não executá-lo automaticamente após restaurar banco.
- **[CONFIRMADO]** `NODE_ENV=production`, builds em `dist`, scripts chamados deploy e HTTPS local não significam produção.

## Limites e rastreabilidade

**[CONFIRMADO]** Esta tarefa só escreveu os 13 documentos desta pasta. Não alterou código/infraestrutura/certificados; não iniciou/parou containers ou serviços; não instalou dependências; não executou build, testes, seed, migrations, deploy, commit ou push. Consultou Git remoto com `ls-remote`, sem fetch/pull. Arquivos privados foram inventariados sem transcrever seus segredos; chaves privadas TLS não foram lidas.

**[CONFIRMADO]** Foram analisados fontes, manifests/locks, scripts, docs, Git/reflog, artefatos ignorados, inspeções Docker, listeners, tarefas agendadas, metadados de PM2/certificados e histórico local de sessões. As referências `arquivo:linha` são relativas à raiz auditada e podem mudar após novos commits.

**[DESCONHECIDO]** Dados internos do banco parado, migrations efetivamente aplicadas, identidade de CA usada pelo processo SYSTEM em execução, funcionamento ponta a ponta e recuperação real ainda precisam ser verificados. O roteiro final foi simulado documentalmente, não executado em máquina formatada.

**[CONFIRMADO]** O pacote passou por revisão independente de infraestrutura/backend/frontend, conferência dos 13 arquivos e links internos, busca de valores privados conhecidos sem reproduzi-los e análise sintática dos 18 blocos PowerShell sem executá-los. Isso verifica a documentação; não substitui teste real de backup/restore ou homologação da aplicação.
