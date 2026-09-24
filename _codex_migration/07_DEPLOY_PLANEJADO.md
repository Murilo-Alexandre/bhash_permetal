# Fluxo de deployment e rollback

## Fluxo preparado hoje

**[CONFIRMADO]** O repositório prepara este fluxo híbrido, cuja execução em Linux permanece **[DESCONHECIDO]**:

```text
LOCAL: código + locks + migrations
   -> GIT/GITHUB: versão publicada pelo responsável
   -> SERVIDOR LINUX: clone/pull e configuração privada
   -> DOCKER: PostgreSQL/Redis de imagens prontas
   -> BUILD NO HOST: npm + Prisma generate + migrations + builds
   -> PM2: backend3000 / chat5173 / admin5174 como processos Node
   -> PROXY HTTPS: Nginx com certificados provisionados
   -> APLICAÇÃO: navegador/PWA/Electron
```

**[CONFIRMADO]** Containers atuais não recebem o build do aplicativo. Não há GitHub Actions, registry nem gatilho automático de deploy encontrados no código. GitHub transporta fonte; `.env`, dados e TLS exigem outra transferência protegida.

## Se o objetivo for aplicação toda em containers

**[PLANEJADO]** Este seria outro fluxo, ainda por construir:

```text
LOCAL -> GIT/GITHUB -> SERVIDOR/CI DE BUILD
      -> imagens backend/chat/admin/proxy
      -> containers com rede/healthchecks/volumes explícitos
      -> proxy HTTPS + certificados persistentes
      -> aplicação
```

**[PLANEJADO]** Faltam Dockerfiles, `.dockerignore`, Compose completo, separação build/runtime, configuração por ambiente, volume de uploads, estratégia de secrets, redes/portas internas, espera do banco, execução controlada de migrations, TLS e healthchecks. Se build for no CI, também faltam registry, credenciais e promoção de imagens por versão/digest.

**[CONFIRMADO]** Nada disso foi implementado nesta auditoria. Escolher a topologia antes de alterar scripts existentes.

## Sequência futura de preparação Linux

Todas as etapas desta seção são **[PLANEJADO — NÃO EXECUTADO]**. Os scripts que realizam deploy não são comandos de auditoria.

1. Confirmar destino, distribuição, conta de serviço, acesso, domínio e se a implantação será híbrida ou containers. Manter a informação “não está em produção” até evidência/autorização de mudança.
2. Fixar versão do fonte/locks; conferir `git status`, commit e migrations. Preservar dados/segredos atuais conforme 08. Resolver divergência env real/tenant e não sobrescrever silenciosamente.
3. Preparar Linux com Node compatível e Docker/Compose, diretório previsto `/opt/bhash`, permissões e timezone. Paths de updates do exemplo Windows precisam ser definidos para Linux.
4. Preparar PostgreSQL e storage. Restaurar dump+uploads ou inicializar banco vazio deliberadamente. Conferir retenção antes do primeiro backend. Não rodar seed em dados restaurados.
5. Instalar pelo lock, gerar Prisma, conferir migrations pendentes, aplicar somente após snapshot validado; buildar no destino apropriado. Scripts atuais usam `npm install`, não `npm ci`.
6. Iniciar um único modo de aplicação. Rever binds do `ecosystem.proxy.config.cjs`, uso de Vite preview e compatibilidade do path `dist/src/main.js`. Não presumir que script Linux usa modo proxy.
7. Instalar proxy/cadeia TLS e DNS, resolver feed Electron e limite de uploads. Testar HTTP/API/WS/mídia/admin, cadeia de certificados e confiança nos clientes.
8. Configurar boot após funcionamento manual validado; validar reinício da máquina, recuperação do banco e logs.
9. Homologar regras funcionais e segurança; validar backup/restore/rollback em ambiente isolado; registrar critérios e evidências. Só então preparar pedido de implantação final, se solicitado.

## O que scripts atuais fazem e o que não fazem

| Ação | [CONFIRMADO] existe | Limite |
|---|---|---|
| Primeiro deploy | scripts/linux/first-deploy.sh | Não configura Nginx/certificados/DNS; usa PM2 normal. |
| Atualização | scripts/linux/update.sh | Pull/migrations/build inplace; sem snapshot/saúde/rollback. |
| systemd | install-systemd-service.sh | Restaura dump PM2; prontidão do banco e PATH não homologados. |
| Kit tenant | render-tenant/server-up | Gera configs; server-up sobrescreve env; não comprova serviço externo ativo. |
| Desktop Windows | release-win/release-desktop-tenant | Bump, build e cópia de artefatos; efeitos de publicação, não rotina de inspeção. |
| Certificados | Caddy/template Nginx | Material local real existe; renovação Linux não entregue. |
| Backup/restore/rollback | Não encontrado | Deve ser construído/testado. |

**[INFERIDO]** `release-desktop-tenant.cjs:121–145` passa diretório de publicação ao release, mas não injeta necessariamente URLs daquele tenant na geração de defaults. Como `.env` raiz diverge do tenant, validar os endpoints embutidos antes de gerar/distribuir novo instalador. O feed do `package.json` também tem fallback próprio.

## Rollback de aplicação e banco

**[CONFIRMADO]** Não há rollback automatizado; Git não reverte migrations nem restaura uploads. Script update não conserva release anterior. Só há recomendação em `docs/electron-rollout.md` de manter artefatos desktop antigos.

**[PLANEJADO]** Antes de cada versão, registrar commit anterior/novo, locks, env protegido, configuração proxy, artefatos, migrations e ponto de backup coordenado DB+uploads. Validar que a versão anterior funciona com schema novo; caso contrário o rollback exige restaurar banco e arquivos do mesmo ponto, com perda das alterações posteriores explicitamente reconhecida.

**[PLANEJADO]** Usar diretórios/releases ou imagens imutáveis para preservar versão anterior é melhoria futura. Não descrever `git checkout`/`git reset` seguido de reload como rollback seguro completo.

**[PLANEJADO]** Plano de ensaio: implantar versão em homologação com cópia de dados protegida → executar cenários → provocar rollback planejado → validar login, histórico, anexos, WS, política de mídia e versão. Só declarar recuperável após restaurar de verdade.

## Rollback desktop

**[CONFIRMADO]** Há instaladores 0.1.2 e 0.1.3 em `C:\caddy\updates\desktop\win`, e 0.1.3 no build/kit do projeto. Presença de arquivos não comprova clientes atualizados.

**[PLANEJADO]** Preservar instaladores/metadados antigos e decidir estratégia de reinstalação/versão corretiva. Não prometer downgrade automático simplesmente apontando `latest.yml` para versão menor; o updater precisa ser verificado. Assinatura de código Windows é recomendada nos docs, mas sua operação real não foi confirmada.

## Critérios mínimos antes de chamar de produção

**[PLANEJADO]** Servidor/destino confirmado; topologia decidida; segredos e exposição revistos; auth/anexos/TLS revisados; dados persistentes mapeados; backup+restore e rollback ensaiados; migrations e fluxos homologados; healthchecks, reboot e logs operacionais; documentação atualizada com evidência. Esses critérios continuam pendentes, não são afirmações de operação atual.
