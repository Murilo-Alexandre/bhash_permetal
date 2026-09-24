# Dados persistentes, backup e restauração

## Inventário que precisa sobreviver

| Material | [CONFIRMADO] localização | Recuperável só com Git? |
|---|---|---|
| Banco PostgreSQL | Volume Docker `bhash_bhash_pg`, montagem `/var/lib/postgresql/data` | Não. |
| Redis | Volume anônimo listado em 03; backend não tem integração encontrada | Não; importância funcional ainda não comprovada. |
| Anexos/avatares/logos | `C:\dev\bhash\backend\public\uploads` inteiro | Não; Git só mantém placeholders. |
| Configuração/segredos | `.env` raiz, envs HTTPS dos frontends, `deploy/tenant.env` | Não; exemplos não preservam identidade/segredos reais. |
| Kit gerado | `deploy/out/bashchat-interno` | Não; recriável só se insumos e versão forem preservados. |
| Caddy/proxy/TLS | `C:\caddy`, data-dirs/perfis detalhados em 06 | Não. |
| Canal de update | `C:\caddy\updates\desktop\win` e ferramentas distribuídas | Não; artefatos antigos podem não ser reproduzíveis byte a byte. |
| Instaladores locais | `desktop-electron/dist` e kit gerado | Não; podem ser rebuildados, mas isso não substitui preservar releases antigas. |
| Processos/boot | Tarefas Windows, configs PM2 e `.pm2/dump.pm2` | Parcial; há paths/estado local fora do repo. |
| Contexto | `_codex_migration`, histórico local relevante e patch .temp | Não enquanto não commitados/copiados; histórico é complementar. |

**[CONFIRMADO]** Uploads observados: 22 arquivos, incluindo placeholders, total 2.429.771 bytes. Diretórios: `avatars`, `chat`, `chat-audio`, `chat-files`, `chat-images`, `chat-media`, `conversation-avatars`, além de arquivos diretamente na raiz. Não foram abertos documentos/imagens dos usuários para inventariar conteúdo.

**[CONFIRMADO]** Novos arquivos de chat são gravados em `uploads/chat`; áudio em `chat-audio`; avatares pessoais/de conversa e logos têm destinos próprios. Pastas legadas também podem estar referenciadas por registros antigos. Copiar somente `chat-images`/`chat-files` perde dados.

**[CONFIRMADO]** Banco contém IDs, usuários/admins, hashes, empresas/setores, mensagens, participantes/regras, audiência, leitura/visibilidade/favoritos/reações, branding e agenda de retenção. Bytes de anexos vivem fora dele. Restore exige pares coerentes banco+filesystem.

## A função de “backup” da UI não protege dados

**[CONFIRMADO]** `backend/src/admin-history/admin-history.service.ts:389–456` percorre anexos IMAGE/FILE/AUDIO com URL e sem deletedAt, apaga arquivos e limpa metadados; não cria cópia. Não há filtro de idade na seleção. Agenda/frequência define quando essa limpeza ocorre, não a idade mínima de cada anexo.

**[CONFIRMADO]** Scheduler executa no bootstrap. `GET /admin/history/retention-policy` também pode chamar a rotina vencida (`:491–507`). Não usar esse GET nem inicializar AppModule/E2E como inspeção de leitura em dados preservados.

**[INFERIDO]** Restaurar banco antigo com política habilitada/vencida e iniciar backend pode apagar imediatamente arquivos restaurados. Se o PM2 estiver tentando reiniciar backend, apenas ligar PostgreSQL pode ser suficiente para disparar isso. Antes de ligar banco para backup/restore, isolar os processos da aplicação e tarefas de reinício; preservar cópia física original primeiro.

**[INFERIDO]** Anexos de broadcast compartilham URL; a exclusão administrativa de um anexo pode afetar outras mensagens. Backup e revisão funcional devem considerar essa referência compartilhada.

## Situação de backup

**[CONFIRMADO]** Não foram encontrados scripts próprios de dump/restore, agenda, destino externo, retenção de backups ou rollback de banco no repositório. O diretório Caddy chamado cert-backup contém certificados antigos/incompletos, não backup completo do projeto.

**[DESCONHECIDO]** Existência de outro backup recuperável fora dos locais auditados. **[CONFIRMADO]** Nenhum backup, dump, exportação ou restauração foi realizado nesta tarefa.

**[PLANEJADO]** Antes de formatar, produzir backup externo protegido e testar restauração em ambiente isolado. Definir responsável, frequência, retenção, criptografia, RPO/RTO e alertas; esses parâmetros ainda não foram escolhidos. Incluir manifest com commit, versões, timestamp/timezone, checksums, lista de arquivos e resultado do teste, sem segredos em texto aberto.

## Procedimento futuro de preservação

**[PLANEJADO — NÃO EXECUTADO]** Os comandos abaixo escrevem backup e podem alterar containers/processos. São roteiro para uma futura tarefa autorizada, não ações realizadas nesta auditoria. Usar destino real fora do disco que será formatado; `E:\BHASH_BACKUP\2026-09-24` é EXEMPLO e deve ser substituído.

1. Conferir projeto, container, volume, destinos e espaço. Preservar env/configs com acesso restrito. Impedir escrita de usuários e reinício automático dos processos BHASH durante o snapshot. Não parar outros projetos indiscriminadamente.
2. Como PostgreSQL foi encontrado parado, manter cópia física consistente do volume original antes de ativar banco/aplicação. Uma exportação de volume parado pode ser complemento; não é cópia de pasta Windows comum.
3. Com backend/PM2 BHASH isolado, iniciar somente PostgreSQL para dump lógico. Confirmar prontidão; não iniciar `dev:all`, seed ou API admin.
4. Exportar banco e copiar uploads/configs do mesmo período sem escrita. Voltar serviços ao estado decidido somente depois do backup verificado.

Exemplo de exportação física complementar de **volume existente e parado**, depois de confirmar nome e destino:

```powershell
Set-Location C:\dev\bhash
$backupDir = 'E:\BHASH_BACKUP\2026-09-24'
New-Item -ItemType Directory -Path $backupDir -Force -ErrorAction Stop
if (Test-Path -LiteralPath "$backupDir\bhash_pg_cold.tgz") { throw 'Archive já existe; escolha outro destino sem sobrescrever.' }
docker volume inspect bhash_bhash_pg
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker compose ps -a
# Verificar parada do PostgreSQL e da aplicação antes da linha seguinte.
docker run --rm --mount 'type=volume,src=bhash_bhash_pg,dst=/data,readonly' --mount "type=bind,src=$backupDir,dst=/backup" alpine:3.20 tar -czf /backup/bhash_pg_cold.tgz -C /data .
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[PLANEJADO]** Esse comando cria um container auxiliar e pode baixar imagem. Se volume não existir, não continuar: um mount por nome errado pode criar volume vazio. Cópia física depende de compatibilidade PostgreSQL 16/arquitetura/permissões e não substitui ensaio de recuperação. [Referência Docker volumes](https://docs.docker.com/engine/storage/volumes/).

Exemplo de dump lógico, **somente depois de impedir backend de reconectar automaticamente**:

```powershell
Set-Location C:\dev\bhash
$backupDir = 'E:\BHASH_BACKUP\2026-09-24'
New-Item -ItemType Directory -Path $backupDir -Force -ErrorAction Stop
if (Test-Path -LiteralPath "$backupDir\bhash.dump") { throw 'Dump já existe; escolha outro destino sem sobrescrever.' }
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker compose exec -T postgres pg_isready -U bhash -d bhash
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
# Prosseguir somente se o servidor estiver aceitando conexões.
docker exec bhash-postgres pg_dump -U bhash -d bhash -Fc -f /tmp/bhash.dump
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
# Verificar exit code zero antes de copiar.
docker cp bhash-postgres:/tmp/bhash.dump "$backupDir\bhash.dump"
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker exec bhash-postgres pg_restore --list /tmp/bhash.dump
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
Get-FileHash -Algorithm SHA256 -LiteralPath "$backupDir\bhash.dump"
```

**[PLANEJADO]** Arquivo custom `-Fc` evita depender de SQL textual e é restaurado por pg_restore. Gravar no container e usar docker cp evita redirecionamento binário pelo PowerShell antigo. Listar o archive confirma legibilidade básica, não recuperação integral. [Documentação PostgreSQL 16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html).

**[PLANEJADO]** Se autenticação falhar, obter credencial do backup privado/operador; nunca colá-la em comandos/documentação/logs. Dump de um banco não inclui automaticamente todos os papéis/objetos globais do cluster. O caso atual usa role `bhash` criada pelo Compose; mudanças externas de roles continuam desconhecidas.

**[PLANEJADO]** Copiar `backend/public/uploads` inteiro para backup mantendo árvore, além de material privado listado acima. Validar contagens/tamanhos/hashes na origem e destino. Guardar CA/chaves e envs com criptografia/ACL; não colocar material secreto no pacote Markdown, Git ou mídia pública. Browser/Electron podem conter tokens/senhas lembradas: preferir novo login após reinstalar.

## Restauração lógica em máquina nova

**[PLANEJADO — NÃO EXECUTADO]** Pré-requisitos: código/locks e env recuperados, containers com banco **novo e vazio**, application/PM2 ainda desligados, dump validado e uploads do mesmo ponto. Não executar migrations/seed antes do restore do dump completo.

```powershell
Set-Location C:\dev\bhash
$backupDir = 'E:\BHASH_BACKUP\2026-09-24'
if (-not (Test-Path -LiteralPath "$backupDir\bhash.dump" -PathType Leaf)) { throw 'Dump não encontrado; interrompa a restauração.' }
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker compose exec -T postgres pg_isready -U bhash -d bhash
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker cp "$backupDir\bhash.dump" bhash-postgres:/tmp/bhash.dump
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker exec bhash-postgres pg_restore --list /tmp/bhash.dump
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker exec bhash-postgres pg_restore --exit-on-error --no-owner --no-privileges -U bhash -d bhash /tmp/bhash.dump
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[PLANEJADO]** Não usar `--clean`, recriar banco existente ou repetir restore sobre dados parcialmente restaurados sem avaliar o resultado. Restaurar em destino vazio isolado, conferir exit codes e investigar falhas. `--no-owner --no-privileges` cria objetos sob o usuário do restore e não reproduz proprietários/ACLs especiais; se existirem, inventariar e restaurar conscientemente à parte. Se só houver backup físico, planejar recuperação PostgreSQL 16 específica e preservar archive original; não misturar duas estratégias no mesmo volume.

**[PLANEJADO]** Restaurar uploads em `backend/public/uploads`, envs e demais configurações; comparar migrations com schema e commit. Antes do primeiro backend, ler a política diretamente no SQL em transação somente leitura:

```powershell
@'
BEGIN TRANSACTION READ ONLY;
SELECT "mediaRetentionEnabled", "mediaRetentionInterval", "mediaRetentionIntervalCount",
       "mediaRetentionRunHour", "mediaRetentionRunMinute", "mediaRetentionNextRunAt"
FROM app_config;
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations ORDER BY migration_name;
COMMIT;
'@ | docker exec -i bhash-postgres psql -v ON_ERROR_STOP=1 -U bhash -d bhash
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[PLANEJADO]** Se política estiver vencida/ativa, decidir explicitamente como preservar os anexos antes do startup; não há switch ambiental de auditoria documentado. Qualquer alteração dessa política em banco restaurado deve ser deliberada, registrada e preservando original. Se tabela/coluna não existir, conferir versão/schema; não “corrigir” rodando seed.

**[PLANEJADO]** Validar contagem de usuários/conversas/mensagens por SQL e comparar com manifest do backup; conferir amostras de URLs/arquivos e somente então executar migrations necessárias e aplicação. Por proteção de dados, a auditoria não inventou essas contagens.

## Critério de recuperação e rollback

**[PLANEJADO]** Backup recuperável exige restore completo em ambiente isolado, login com conta controlada, histórico, anexos, grupos/listas, WS e política de mídia conferidos. Guardar relatório com versão/horário/resultado. Um arquivo tar ou dump existir não basta.

**[CONFIRMADO]** Rollback do código não reverte schema/dados. **[PLANEJADO]** Restaurar banco+uploads do mesmo ponto quando compatibilidade impedir retorno só da aplicação. Preservar originais e reconhecer perda de eventos posteriores ao snapshot. Ver 07.
