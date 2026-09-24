# Git e GitHub

## Estado confirmado

**[CONFIRMADO]** Repositório local `C:\dev\bhash`; branch `main`; HEAD `1a729f98607026804998ff11d14e89dfd24861aa`. Antes de criar esta pasta, `git status --porcelain` estava vazio. Não havia alterações rastreadas nem arquivos novos não ignorados.

**[CONFIRMADO]** Origin: [Murilo-Alexandre/bhash_permetal](https://github.com/Murilo-Alexandre/bhash_permetal), URL Git `https://github.com/Murilo-Alexandre/bhash_permetal.git`. `origin/main` local apontava ao mesmo commit e **`git ls-remote --heads --tags origin` confirmou main nesse SHA em 24/09/2026**, sem outras heads/tags retornadas. Não foi feito fetch/pull/push.

**[DESCONHECIDO]** Visibilidade pública/privada, PRs/issues abertos, branch protection, permissões, secrets e configurações de Actions no servidor. GitHub CLI existe, mas consultas `gh api` não puderam prosseguir por falta de autenticação na CLI. Acesso Git funcional não significa sessão `gh` configurada. Não foi instalada integração nem feito login.

**[CONFIRMADO]** Nenhum workflow `.github` ou pipeline CI/CD foi encontrado no código versionado. Não assumir build, deploy ou atualização de servidor a cada push.

## Linha de continuidade

| Commit | Data local | [CONFIRMADO] assunto |
|---|---|---|
| `1a729f9` | 02/04/2026 15:28 -03 | Acerto menu dados do usuário; também mudanças em conversas/mensagens/UI e ações de limpeza. |
| `9b3808a` | 01/04/2026 | Listas e grupos implementados. |
| `e233983` | 27/03/2026 | Início de grupos/listas; áudio e regras de broadcast. |
| `dad3f3b` | 25/03/2026 | Prepare repository for Permetal deployment. |
| `2b297c0` | 19/03/2026 | Painel/admin/logos/cores e retenção. |
| `b5dba65` | 12/03/2026 | Tenant kit, clean deployment e auto-update desktop. |
| `ea1ec06` | 10/03/2026 | PM2/Linux e início Electron. |

**[CONFIRMADO]** Reflog consultado coincide com a sequência recente. **[DESCONHECIDO]** Trabalho externo não encontrado, branches já removidas ou cópias em outros computadores. Datas de uploads locais posteriores ao último commit não provam mudança de código.

## O que está fora do Git

**[CONFIRMADO]** `.gitignore` exclui `.env`/variantes (exceto exemplos), `deploy/tenant.env`, `deploy/out`, `backend/generated/prisma`, uploads runtime, node_modules, dist/build, logs, `.temp`, `.vscode` e `desktop-electron/src/defaults.json`.

**[CONFIRMADO]** Existem itens importantes ignorados: envs reais; kit `deploy/out/bashchat-interno`; uploads; build Electron; `.temp/broadcast-sidebar.patch` (6.725 bytes); builds web/backend. O patch não foi aplicado e não representa mudança pendente confirmada: pode ser artefato de trabalho anterior. Preservá-lo como contexto, nunca reaplicá-lo automaticamente.

**[CONFIRMADO]** Caddy/TLS e volumes Docker estão fora da árvore. Nem clone nem bundle Git os recuperam. `.gitignore` não protege conteúdo já publicado em commits antigos: o histórico contém uploads antigos; não usar Git como repositório de mídia recuperável ou presumir limpeza retroativa.

**[CONFIRMADO]** Esta documentação foi criada sem commit/push. Ela precisa ser copiada para backup externo para sobreviver à formatação; não aparecerá num novo clone enquanto não for versionada em tarefa futura autorizada.

## Reconstrução futura

**[PLANEJADO — NÃO EXECUTADO]** Se não houver cópia local completa:

```powershell
git clone https://github.com/Murilo-Alexandre/bhash_permetal.git C:\dev\bhash
Set-Location C:\dev\bhash
git status --short --branch
git log -5 --oneline
git rev-parse HEAD
```

**[PLANEJADO]** Comparar com SHA auditado antes de instalar/migrar. Se remoto avançou, não resetar mudanças nem retroceder banco automaticamente; escolher conscientemente a versão a reconstruir. Recuperar esta pasta e material privado do backup em separado. Novo Git Credential Manager/SSH pode precisar de autenticação do proprietário; não restaurar tokens em texto nesta documentação.

**[PLANEJADO]** Para preservar histórico offline antes da formatação, uma cópia protegida da pasta completa com `.git` ou bundle Git pode complementar o backup; bundle não inclui arquivos ignorados/não commitados. Não foi criado nenhum nesta auditoria.

## Fluxo desejado, ainda sem automação

**[PLANEJADO]** Desenvolvimento local → revisão/testes isolados → commit/push autorizado → servidor obtém versão determinada → instalação/build/migration controlados → serviços → verificação. Ver 07 para o fluxo Linux real preparado e a alternativa de containers ainda por construir. Nunca presumir permissão de commit/push/deploy a partir deste documento.
