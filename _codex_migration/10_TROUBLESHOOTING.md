# Troubleshooting com base nas evidências

**[CONFIRMADO]** As causas abaixo foram identificadas nos arquivos/estado da máquina; soluções são **[PLANEJADO]**, não executadas. Não usar restauração/seed/limpeza destrutiva como tentativa automática.

| Sintoma | Causa a conferir | Próximo passo seguro |
|---|---|---|
| Docker não lista BHASH | Contexto errado, Engine parado ou pasta/projeto Compose diferente | Conferir docker context show, compose version/ps; não criar volume novo antes de inventariar. |
| Banco vazio depois do clone | Git não contém banco; outro nome de projeto cria outro volume | Comparar `bhash_bhash_pg`, nome do projeto e backups; não rodar seed para esconder ausência. |
| Backend não sobe/ECONNREFUSED | PostgreSQL parado/inacessível; env URL errada | Conferir container/porta/URL sem imprimir senha; preservar mídia e impedir startup automático antes de ativar banco restaurado. |
| EADDRINUSE em 3000 | Outro projeto Docker publicou 3000, como observado | Identificar proprietário; coordenar parada ou mudança coerente de todas as URLs/proxies em tarefa autorizada. |
| 5173/5174 ocupadas | PM2/boot e dev:all simultâneos | Escolher um modo; não encerrar processos por nome genérico node.exe. |
| Prisma client ausente | Cliente padrão @prisma/client em node_modules/.prisma/client ainda não gerado | Reinstalar deps e prisma:generate em futura recuperação; não copiar binários gerados de outra plataforma. |
| Tabela/coluna ausente | Migrations do código diferentes do banco | Comparar `_prisma_migrations`/commit em leitura; backup antes de migration. |
| Login inexiste em banco novo | Migration não cria contas | Bootstrap/seed deliberado com env preparado; nunca repetir em restore sem avaliar resets. |
| Senhas mudaram após seed | Seed faz upsert e regrava hashes/atividade | Preservar banco anterior e investigar; não repetir seed. |
| Anexos somem após startup | Política de retenção habilitada/vencida | Parar investigação via API e preservar backup; ler SQL em transação read-only. GET política também pode apagar. |
| Histórico existe, arquivo 404 | Uploads ausentes, cwd errado, URL antiga ou mídia removida | Conferir uploads inteiro e cwd backend; restaurar arquivo compatível a partir de backup. |
| Browser não reconhece HTTPS | CA correta ausente, nome errado, outra CA por perfil Caddy | Comparar SAN/thumbprint/storage e hosts; não desabilitar TLS como correção. |
| HTTPS aparece mas API 502 | Proxy 3000 sem backend saudável ou porta de outro app | Conferir listeners/PM2 config/banco; página HTTPS não prova app. |
| WS cai, HTTP funciona | Rota socket/upgrade/path/origem incorretos | Conferir /socket.io, headers upgrade, token e proxy; não confundir /api com namespace socket. |
| Upload 413 no Linux | Nginx 40m versus app 250 MiB | Definir limite aprovado e ajustar camadas consistentemente em trabalho futuro. |
| Mudar env raiz não muda frontend | Vite loadEnv usa cwd do módulo; variáveis incorporadas no build | Conferir envDir/variáveis efetivas e rebuild autorizado; não publicar automaticamente. |
| dev:https não funciona limpo | https:{} sem arquivos de certificado/plugin | Usar HTTP localhost para recuperação básica; preparar Caddy/TLS separadamente. |
| App antigo após build | Cache PWA, serviço apontando dist antigo ou browser/Electron | Conferir commit, paths e asset servido antes de limpar cache/reinstalar. |
| Instalação Electron aponta host errado | defaults vêm do env raiz; tenant pode divergir | Conferir defaults/tenant/root e artefato; não disparar release para diagnosticar. |
| Feed desktop 404 em Linux | Nginx gerado não tem rota de updates | Implementar hospedagem dos artefatos e testar URLs em homologação. |
| PM2 status online mas sem app | Dump é snapshot; restart loop/DB/conflito de porta | Inspecionar logs/timestamps/listeners, não assumir prontidão. |
| Linux falha após reboot | Node fora do PATH, PM2_HOME/usuário errado, DB não pronto | Conferir unit, permissões, caminho do Node, dump e dependências; reboot precisa ensaio. |

## Inspeções úteis

**[PLANEJADO]** Comandos de leitura para orientar uma nova sessão:

```powershell
Set-Location C:\dev\bhash
git status --short --branch
git log -5 --oneline
docker context show
docker compose ps -a
docker inspect bhash-postgres --format '{{.State.Status}} {{json .Mounts}}'
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -In @(80,443,3000,5173,5174,5432,6379) |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

**[PLANEJADO]** Ao compartilhar logs/envs, extrair somente mensagens técnicas necessárias e mascarar dados privados. Não imprimir `docker inspect` completo com env, dump PM2 inteiro, `.env` raw ou payloads de mensagens. Docker `compose config` completo também pode expandir segredos.

**[CONFIRMADO]** Até comandos de aparência diagnóstica podem alterar estado: PM2 pode iniciar daemon se não existir; scripts status/health de aplicação podem tocar endpoints; GET política de retenção dispara limpeza. Nesta auditoria PM2 foi analisado por arquivos/metadados, sem iniciar daemon.

## Armadilhas dos scripts

- **[CONFIRMADO]** `scripts/windows/pm2-resurrect.ps1` apaga os três apps PM2 e inicia config proxy + save; não é mero leitor/restaurador passivo.
- **[CONFIRMADO]** `deploy:server:up`, `render:apply` e release desktop escrevem/aplicam/publicam. Nunca usá-los para “ver o que aconteceria” sem ler código e ter escopo autorizado.
- **[CONFIRMADO]** `backend` lint usa --fix; format escreve; tests:E2E abre AppModule real com scheduler.
- **[CONFIRMADO]** `start:prod` backend aponta dist/main, enquanto PM2/build observado usam dist/src/main.js. Conferir saída real e cwd antes de mudar script.
- **[CONFIRMADO]** `infra:down` preserva volumes por padrão, mas `down -v`/prune/remove de volume apagam persistência. Não usar como troubleshooting genérico.

**[DESCONHECIDO]** Nenhuma correção aqui foi aplicada/validada em runtime. Depois de reproduzir um problema em cópia controlada, documentar causa, mudança, teste e resultado no pacote para o próximo operador.
