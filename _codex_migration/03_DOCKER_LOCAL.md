# Docker local: o que existe e como funciona

## Compose versionado

**[CONFIRMADO]** `docker-compose.yml:1` contém somente:

| Serviço | Imagem | Container | Mapeamento | Volume | Reinício |
|---|---|---|---|---|---|
| postgres | postgres:16 | bhash-postgres | 5432:5432 | bhash_pg -> /var/lib/postgresql/data | unless-stopped |
| redis | redis:7 | bhash-redis | 6379:6379 | não declarado no Compose | unless-stopped |

**[CONFIRMADO]** Banco e usuário definidos no Compose são `bhash`. A senha de desenvolvimento é fixa no arquivo; não é reproduzida aqui. `.env` não parametriza essas credenciais. Mudar `DATABASE_URL` não muda a senha do PostgreSQL, e mudar env de inicialização não reconfigura um volume existente.

**[CONFIRMADO]** Não há `build`, Dockerfile, bind mount de código, volumes de uploads, healthchecks, `depends_on` ou redes customizadas. O clone Docker referido neste pacote é a infraestrutura do projeto. O aplicativo precisa de Node/npm no host.

## Estado realmente observado em 24/09/2026

| Item | [CONFIRMADO] resultado |
|---|---|
| Engine | Docker Desktop Linux/WSL2, contexto desktop-linux; client/server 29.6.2; Compose 5.3.1. |
| bhash-postgres | Exited(0), encerrado em 2026-09-02T15:44:52Z; não iniciado nesta auditoria. |
| bhash-redis | Exited(0), encerrado na mesma ocasião. |
| Volume PG | **bhash_bhash_pg**, local, montagem /var/lib/postgresql/data. |
| Rede | **bhash_default**, bridge; derivada automaticamente do nome de projeto bhash. |
| Redis runtime | Volume anônimo **`1a96862c8953ac6beedfa0c33e7df35ebc079410c8b400e975ad80bb9ab58b1f`**, montagem /data. |
| Origem Compose | Labels dos containers apontam C:\dev\bhash\docker-compose.yml. |

**[CONFIRMADO]** O Redis tem volume anônimo por comportamento da imagem, embora o Compose não declare persistência. Não há garantia de reutilização numa recriação; não foi encontrada integração Redis no código backend. Preservar sua existência como evidência, sem tratá-lo como banco canônico do chat.

**[DESCONHECIDO]** Conteúdo/contagens do PostgreSQL, consistência de dados e migrations aplicadas: containers ficaram parados e não houve consulta ao banco. Volume existir não comprova recuperação validada.

## Portas e interferências

**[CONFIRMADO]** O Compose publica 5432/6379 sem restringir `HostIp` ao loopback. Quando ativo, isso pode expor infraestrutura à rede conforme firewall. A aplicação host usa `localhost:5432`; `postgres:5432` seria nome DNS válido dentro da rede Docker, não para o Node no Windows.

**[CONFIRMADO]** Na auditoria havia listeners 5173 em 127.0.0.1 e 5174 em 0.0.0.0, Caddy 443, System 80. Porta 3000 estava publicada por frontend de **outro projeto**, `meethub_frontend`, via Docker. Não desligar esse projeto sem autorização. A existência de uma página na 3000 não valida BHASH.

**[CONFIRMADO]** O snapshot `.pm2/dump.pm2` identifica três processos BHASH, mas é estado salvo, não teste de saúde. Tail de log backend contém `ECONNREFUSED`. Logs backend somam aproximadamente 5,25 GB; rotação/causa de falha precisam ser tratadas futuramente.

## Comandos já existentes

```powershell
# Consultas de leitura
Set-Location C:\dev\bhash
docker context show
docker compose version
docker compose ps -a
docker volume inspect bhash_bhash_pg
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker network inspect bhash_default
```

**[PLANEJADO — NÃO EXECUTADO]** Em futura retomada autorizada, depois de preservar/restaurar dados e conferir portas: **isolar primeiro os processos backend/PM2 e suas tarefas de reinício**, pois apenas ligar PostgreSQL pode permitir reconexão e disparar retenção destrutiva. Conferir `.env` antes de generate. No ramo de restore, ainda não iniciar a aplicação:

```powershell
Set-Location C:\dev\bhash
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm --prefix backend ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm --prefix frontend ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm --prefix frontend-admin ci
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm run infra:up
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker compose exec -T postgres pg_isready -U bhash -d bhash
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm run prisma:generate
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[PLANEJADO]** Escolher então o ramo do capítulo 11: restaurar banco existente OU criar banco novo com migrations e bootstrap explícito. Somente depois iniciar `npm run dev:all`. Subir o backend antes de conferir a política de retenção de banco restaurado pode apagar mídia.

**[CONFIRMADO]** `infra:up` executa `docker compose up -d`; `infra:down` executa `docker compose down`, sem remover volumes com `-v`. Não usar `down -v`, `volume prune`, reset do Docker Desktop ou exclusão de VHDX para resolver falhas.

## Nome do projeto e recuperação

**[CONFIRMADO]** O volume real tem prefixo do projeto Compose (`bhash_bhash_pg`), não apenas o nome lógico `bhash_pg`. Clonar com outro nome de pasta pode criar outro volume vazio. Usar `C:\dev\bhash` ou definir conscientemente o projeto Compose como `bhash`, após verificar volumes existentes. Não confundir banco vazio novo com perda lógica de tabelas.

**[CONFIRMADO]** O disco Docker Desktop encontrado foi `C:\Users\INFORMATICA2\AppData\Local\Docker\wsl\disk\docker_data.vhdx` (~15 GB); também existe `wsl\main\ext4.vhdx`. Eles contêm infraestrutura de outros projetos. **[PLANEJADO]** Backup global, se escolhido, deve seguir encerramento consistente do Docker/WSL e procedimento oficial; não copiar VHDX em uso nem restaurá-lo sobre uma instalação com dados sem planejamento.

**[CONFIRMADO]** Não houve exportação/importação de volume nesta auditoria. O backup específico BHASH e a restauração lógica estão descritos em 08/11. [Referência oficial Docker sobre recuperação](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/).

## Desenvolver versus reproduzir preview local

- **[PLANEJADO] Dev:** Node watch e Vite via `dev:all`; URLs HTTP localhost 5173/5174; banco Docker ativo.
- **[PLANEJADO] Preview local existente:** `build:all` e `services:start:proxy`; Caddy restaurado separadamente, quando necessário. Backend/admin ainda escutam em 0.0.0.0 nesse arquivo.
- **[CONFIRMADO]** Os dois modos concorrem pelas mesmas portas. Não executar ambos simultaneamente. Reinstalar tarefas Windows também pode iniciar PM2 automaticamente; resolver isso antes da retomada.
- **[PLANEJADO] Stack integral em containers:** é trabalho futuro; não existe comando `docker compose up --build` capaz de construir os três aplicativos com o Compose atual.
