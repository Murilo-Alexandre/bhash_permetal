# Reconstrução após formatação

**[PLANEJADO — NÃO EXECUTADO]** Este é um roteiro de futura recuperação LOCAL. Instalar pacotes, restaurar banco, iniciar serviços, gerar builds e configurar certificados alteram estado e não foram feitos na auditoria. A tarefa atual autorizou somente documentação. O próximo trabalho deve respeitar o escopo que o proprietário autorizar.

## 1. Antes de apagar o computador

**[PLANEJADO]** Não prosseguir com formatação até localizar, copiar para destino externo e validar:

- Código, `.git`, esta pasta e eventual trabalho ignorado necessário.
- Dump lógico PostgreSQL validado como caminho principal e cópia física consistente complementar do volume original, com versão, data e checksums. Se houver somente cópia física, a recuperação específica desse formato precisa ser planejada e ensaiada antes de apagar o original; o roteiro de restore deste pacote usa dump lógico.
- Pasta completa `backend/public/uploads`, correspondente ao banco.
- `.env`, `deploy/tenant.env`, envs HTTPS locais e kit gerado, em backup privado.
- Caddyfile real, data-dir/CA/chaves do perfil efetivamente usado e arquivos de distribuição desktop. O material do SYSTEM não pôde ser auditado por falta de acesso.
- Informações de DNS/hosts, tarefas Windows/conta de execução e endpoints escolhidos; não depender de recuperar de memória.
- Acesso do proprietário ao GitHub e às contas necessárias, sem copiar credenciais para o Markdown.

**[CONFIRMADO]** Este pacote não contém backups nem segredos e não comprova que eles já foram copiados. **[DESCONHECIDO]** Sem esses insumos, é possível reconstruir software vazio; não prometer recuperar mensagens/anexos/identidade TLS anteriores.

## 2. Máquina limpa e ferramentas

**[PLANEJADO]** Para reproduzir o notebook: Windows com virtualização/WSL2 e Docker Desktop em containers Linux; Git; Node/npm compatíveis. Referência observada: Node 24.15.0/npm 11.12.1, Docker 29.6.2/Compose 5.3.1, Git 2.55.0.windows.4. Não exigir essas versões Docker como única opção; registrar se mudar. Vite requer pelo menos uma versão satisfazendo `^20.19.0 || >=22.12.0`.

**[PLANEJADO]** Instalar ferramentas de fontes oficiais e iniciar Docker Desktop conscientemente. Não importar tarefas PM2/Caddy de boot antes de dados, portas, env e CA estarem conferidos. Não restaurar node_modules Windows para Linux, nem executáveis gerados de plataforma diferente.

```powershell
git --version
node --version
npm --version
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker version
docker context show
docker compose version
```

**[PLANEJADO]** Se PowerShell bloquear `npm.ps1`, usar `npm.cmd`/`npx.cmd` na sessão apropriada em vez de alterar globalmente a política de execução sem necessidade. Verificar cada exit code; não executar a sequência inteira ignorando falhas.

## 3. Recuperar repositório e contexto

**[PLANEJADO]** Restaurar cópia completa protegida ou clonar:

```powershell
git clone https://github.com/Murilo-Alexandre/bhash_permetal.git C:\dev\bhash
Set-Location C:\dev\bhash
git status --short --branch
git rev-parse HEAD
git log -5 --oneline
```

**[PLANEJADO]** SHA de referência: `1a729f98607026804998ff11d14e89dfd24861aa`. Comparar; se diferente, entender evolução antes de operar banco. Não resetar automaticamente. Copiar `_codex_migration` do backup se não vier no clone. Ela foi criada sem commit/push.

**[CONFIRMADO]** Não existia AGENTS.md no repo nem em `C:\`/`C:\dev`; arquivo global `C:\Users\INFORMATICA2\.codex\AGENTS.md` estava vazio. **[PLANEJADO]** Reinspecionar instruções que existirem na nova máquina; este pacote fornece contexto, não substitui instrução nova do proprietário.

## 4. Escolher o ambiente e recuperar env

**[PLANEJADO]** Primeiro decidir: (A) restaurar exatamente dados/ambiente local, ou (B) criar ambiente vazio descartável. Depois escolher HTTP dev ou preview/Caddy local. Não usar tenant apply nem scripts Linux nessa fase.

**[CONFIRMADO]** A raiz original usa hosts `*.condominious`/updates, enquanto tenant/kit usam `bashchat`/IP 192.168.2.4. `deploy:server:up` sobrescreve `.env`; não é comando de recuperação neutro.

| Variável/arquivo | Uso e decisão na recuperação |
|---|---|
| `DATABASE_URL` raiz | [CONFIRMADO] Backend/Prisma. Restaurar de forma privada; original aponta localhost 5432/bhash. Credenciais devem corresponder ao banco/Compose. |
| `JWT_SECRET` raiz | [CONFIRMADO] Assina JWT, exigido pelo gateway. Preservar para continuidade ou mudar deliberadamente; nunca usar senha/chave de exemplo em implantação. |
| `APP_HOST`, `PORT` | [CONFIRMADO] Backend; defaults 0.0.0.0/3000. PM2 proxy também fixa esses valores. |
| `CORS_ORIGINS` | [CONFIRMADO] Hosts web permitidos; LAN é amplo. Para dev, conferir origens locais 5173/5174. |
| `VITE_API_BASE`, `VITE_WS_PATH`, `VITE_PROXY_TARGET` | [CONFIRMADO] Contrato dos frontends; raiz pode não ser carregada por Vite. Conferir cwd/env efetivo. |
| `VITE_DEV_HTTPS`, `VITE_ENABLE_SW_DEV` | [CONFIRMADO] Flags locais .env.https; não fornecem certificado. |
| `CHAT_WEB_URL` | [CONFIRMADO] URL embutida/default no cliente Electron. |
| `DESKTOP_UPDATE_URL`, `DESKTOP_UPDATE_PUBLISH_DIR` | [CONFIRMADO] Feed e pasta de publicação; não executar release ao restaurar. |
| `SEED_SUPERADMIN_*`, `SEED_ADMIN_*`, `SEED_USER1_*`, `SEED_USER2_*`, branding | [CONFIRMADO] Contas/config inicial; seed altera contas existentes. Usar somente no ramo B deliberado. |
| Tenant `DB_*`, hosts, `RUN_PROXY_MODE`, `UPDATES_*`, `CLIENT_SKIP_HOSTS` | [CONFIRMADO] Insumos do gerador; não reconfiguram automaticamente credenciais fixas Compose nem rede/CA externa. |

**[PLANEJADO]** Ramo A: restaurar `.env`/tenant/envs privados separadamente, sem sobrescrever após conferência. Ramo B: `npm run env:init` copia `.env.example` se ausente; revisar todos os valores necessários localmente. Exemplos não são segredos prontos e não devem ser transcritos no chat. Em ambiente novo sem backend em execução, credenciais PostgreSQL devem combinar com o Compose atual até uma mudança deliberada de infraestrutura.

## 5. Instalar dependências e gerar cliente

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
npm run prisma:generate
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[PLANEJADO]** Executar só depois de conferir código/env; `npm ci` usa locks e escreve dependências. Não usar `setup:server` neste ponto: ele já migra/builda sem distinguir restore de banco novo. Desktop é opcional e separado: `npm --prefix desktop-electron ci`.

## 6A. Recuperar dados antigos

**[PLANEJADO]** Manter backend/PM2/tarefas automáticas desligados. Inspecionar volumes e portas. Se banco/volume antigo já foi restaurado, não restaurar dump em cima dele; conferir sua origem/estado. Se destino é novo e vazio, seguir exatamente o ramo de restore lógico de 08, com dump+uploads do mesmo snapshot.

```powershell
docker compose ps -a
docker volume ls
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object LocalPort -In @(3000,5173,5174,5432,6379)
```

**[PLANEJADO]** Com dados restaurados e aplicação ainda parada: conferir `_prisma_migrations` e política de retenção por SQL read-only de 08; comparar schema/commit. Se retenção está ativa/vencida, decidir antes de ligar backend. **Não executar seed** para testar acesso ou fazer senha conhecida.

```powershell
Push-Location C:\dev\bhash\backend
npx --no-install prisma migrate status --schema prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
Pop-Location
```

**[PLANEJADO]** Apenas após backup preservado, status compreendido e migrations pendentes revisadas, aplicar `npm run prisma:migrate:deploy` se necessário. Resultado pode ser “sem pendências”. A aplicação não deve depender de rodar migrations novamente sem diagnóstico.

## 6B. Ambiente novo, sem recuperar dados

**[PLANEJADO]** Esse ramo é escolha consciente de banco vazio. Ele não recupera o histórico anterior. Conferir que Compose não aponta a volume com dados importantes antes de iniciar:

```powershell
Set-Location C:\dev\bhash
npm run infra:up
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
docker compose exec -T postgres pg_isready -U bhash -d bhash
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm run prisma:migrate:deploy
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[PLANEJADO]** Após configurar credenciais privadas adequadas e aceitar contas de teste que o seed cria/atualiza, bootstrap explícito:

```powershell
Push-Location C:\dev\bhash\backend
npx --no-install prisma db seed
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
Pop-Location
```

**[CONFIRMADO]** Seed padrão também cria dois usuários de teste; regrava hashes/nomes/atividade e pode reativar contas. Não há parâmetro auditado que transforme automaticamente isso num bootstrap seguro de produção. Em preparação Linux futura, revisar essa estratégia antes de usar.

## 7. Subir o desenvolvimento local

**[PLANEJADO]** Primeiro resolver conflito 3000; no notebook original a porta pertencia ao Docker de outro projeto. Não matar processo alheio. Com portas livres, dados/retenção revisados e banco pronto:

```powershell
Set-Location C:\dev\bhash
npm run dev:all
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[PLANEJADO]** Acessar chat `http://localhost:5173`, admin `http://localhost:5174`, backend `http://localhost:3000`. A página inicial backend é indicativa de processo, não healthcheck completo. Validar login com conta recuperada/controlada; não imprimir senha. Testar API/WS com dois usuários em ambiente controlado.

**[PLANEJADO]** Validar também o último trabalho: limpeza com/sem favoritos, desfazer, ordem da sidebar, ausência de flash, toast, eventos recebidos e refresh. Validar grupos/listas/regras pareadas, não lidas, avatar e anexos. Dados de teste podem ser escritos nessa etapa autorizada; não fazer testes contra dados originais sem preservar cópia.

## 8. Preview local/Caddy, se necessário

**[PLANEJADO]** Encerrar conscientemente dev antes de usar as mesmas portas em PM2. Para reproduzir o modo já preparado:

```powershell
npm run build:all
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
npm run services:start:proxy
if ($LASTEXITCODE -ne 0) { throw 'Etapa falhou; interrompa e investigue antes de prosseguir.' }
```

**[CONFIRMADO]** Esse modo inicia backend 3000 e admin 5174 em 0.0.0.0, chat 5173 em 127.0.0.1. `NODE_ENV=production` aqui continua sendo preview local, não implantação de produção.

**[PLANEJADO]** Restaurar Caddy e CA conforme 06, identificar conta/storage, corrigir resolução de nomes para o IP efetivo da nova máquina e verificar SAN/confiança. Não repetir 192.168.1.137 automaticamente. Não instalar tarefas SYSTEM antes de confirmar data-dir/CA. Admin via HTTP é configuração distinta do tenant; não misturar.

**[PLANEJADO]** Restaurar feed/artefatos antigos separadamente. Electron pode exigir novo login; evitar copiar credenciais lembradas. Gerar novo instalador/update é trabalho posterior com efeitos de versão/publicação; não necessário para validar a web local.

## 9. Continuar preparando Linux

**[PLANEJADO]** Após ambiente local reproduzido e dados protegidos, ler 05/07/09, escolher topologia híbrida versus containers, definir servidor/DNS/TLS/paths e resolver lacunas. Só então modificar código/infraestrutura dentro de uma nova autorização. Não executar `first-deploy.sh`, `update.sh`, `deploy:server:up`, push ou release apenas porque este roteiro os descreve.

## 10. Simulação de computador recém-formatado

| Pergunta da simulação | Resposta e limite |
|---|---|
| Sei obter fonte e versão? | [CONFIRMADO] URL, branch e SHA em 04; autenticação futura pode depender do proprietário. |
| Sei instalar o runtime? | [CONFIRMADO] Versões observadas e restrição Vite documentadas; comandos não testados em OS novo. |
| Sei o que Docker contém? | [CONFIRMADO] Apenas banco/Redis, nomes de volume/rede/portas em 03. |
| Um clone traz os dados? | [CONFIRMADO] Não; lista de insumos e backup/restore em 08. |
| Sei iniciar sem destruir mídia? | [PLANEJADO] Manter app parada, conferir política por SQL antes do startup; backup original preservado. |
| Sei recuperar credenciais/CA? | [PLANEJADO] Por backup privado; valores não estão aqui. Storage SYSTEM permanece pendência de preservação. |
| Sei subir tudo local? | [PLANEJADO] Dependências → banco/restore → generate/migrations conforme ramo → dev:all; Caddy separado. |
| Sei onde continuar? | [CONFIRMADO] UX final já em HEAD, homologação pendente, lista de lacunas Linux/segurança em 09. |
| Posso afirmar produção pronta? | [CONFIRMADO] Não. Preparação/homologação/backup/deploy permanecem distinguíveis. |

**[CONFIRMADO]** A simulação documental revela que os passos técnicos e o ponto de continuidade estão descritos. **[DESCONHECIDO]** A suficiência MATERIAL depende de preservar dados, segredos, CA correta e acesso antes da formatação. Sem eles, nenhum super prompt recupera o conteúdo perdido.
