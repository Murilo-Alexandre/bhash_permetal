# Certificados e HTTPS

## Ambientes que não devem ser confundidos

| Origem | [CONFIRMADO] configuração encontrada |
|---|---|
| .env raiz + Caddy real externo | chat `https://bhash.condominious`, admin `https://admin-bhash.condominious`, updates `https://updates.bhash.com/desktop/win`. |
| hosts Windows | Os três nomes acima apontam para 192.168.1.137 em `C:\Windows\System32\drivers\etc\hosts`. Não foi validado DNS externo. |
| deploy/tenant.env e kit local | servidor 192.168.2.4, host chat/update `bashchat`, admin HTTP em 5174; `CLIENT_SKIP_HOSTS=true`. |
| deploy/tenant.permetal.example | Preparação Permetal com host `bashchat`; é exemplo, não prova servidor instalado. |
| Linux | Modelo Nginx que referencia cert/key no filesystem. Instalação/emissão/renovação [DESCONHECIDO]. |

**[CONFIRMADO]** HTTPS usa TLS e identidade de host; DNS/hosts resolve nome para IP, não para a porta 5173. O proxy 443 encaminha internamente ao serviço. No notebook, até o nome `updates.bhash.com` está associado à CA interna/hosts local; seu formato público não prova serviço público existente.

## Arquivos existentes fora do repositório

**[CONFIRMADO]** Nenhum arquivo de certificado/chave foi encontrado dentro da árvore BHASH inspecionada. O material real está fora do Git:

| Local | Conteúdo e finalidade |
|---|---|
| `C:\caddy\Caddyfile` | [CONFIRMADO] Configuração real dos três hosts/proxies e emissor local. |
| `C:\caddy\caddy.exe` | [CONFIRMADO] Executável usado pela tarefa agendada. |
| `C:\Users\INFORMATICA2\AppData\Roaming\Caddy\pki\authorities\local\root.crt` | [CONFIRMADO] Certificado PÚBLICO da CA raiz; clientes precisam confiar na CA apropriada. |
| Mesmo diretório, `root.key` | [CONFIRMADO] Existência da chave privada raiz; nunca lida. Necessária para preservar identidade/emissão da CA. |
| Mesmo diretório, `intermediate.crt` / `intermediate.key` | [CONFIRMADO] Intermediária e chave; chave nunca lida. |
| `C:\Users\INFORMATICA2\AppData\Roaming\Caddy\certificates\local\bhash.condominious\` | [CONFIRMADO] `bhash.condominious.crt`, `.key`, `.json`: certificado folha, chave e metadados do chat. |
| `C:\Users\INFORMATICA2\AppData\Roaming\Caddy\certificates\local\admin-bhash.condominious\` | [CONFIRMADO] Trio correspondente ao admin. |
| `C:\Users\INFORMATICA2\AppData\Roaming\Caddy\certificates\local\updates.bhash.com\` | [CONFIRMADO] Trio correspondente ao canal de updates. |
| `C:\caddy\cert-backup-20260317-154933` | [CONFIRMADO] Intermediária/folhas/chaves antigas, expiradas em março 2026; não contém backup completo da CA raiz. |
| `C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy` | [DESCONHECIDO] Acesso negado durante auditoria. Não interpretar como ausente. |

**[CONFIRMADO]** Apenas os certificados públicos foram abertos para extrair metadados. Chaves privadas, senhas, tokens e conteúdo de keystores não foram reproduzidos.

## Identidade e validade observadas

**[CONFIRMADO]** CA raiz: `CN=Caddy Local Authority - 2026 ECC Root`. Thumbprint público `CC47857178555EFC919B7A88881D81169A7937BF`, encontrado também em `Cert:\LocalMachine\Root` e `Cert:\CurrentUser\Root`.

| Certificado público | Início UTC | Fim UTC |
|---|---|---|
| Raiz | 11/03/2026 17:17:11 | 18/01/2036 17:17:11 |
| Intermediário | 17/03/2026 18:54:47 | 16/01/2036 18:54:47 |
| Três folhas | 17/03/2026 18:55:02 | 15/01/2036 18:55:02 |

**[CONFIRMADO]** SANs das folhas correspondem aos respectivos hosts. Existe outra CA Caddy no CurrentUser, thumbprint `E5BC1B4CC62869ABDD0EC94CFDD5EE0CAA258AAB`. **[DESCONHECIDO]** Uso dessa outra CA e qual storage o processo SYSTEM atual realmente utiliza. Datas futuras de validade não provam que o certificado correto está sendo servido nem que clientes confiam nele.

## Caddy Windows existente

**[CONFIRMADO]** `C:\caddy\Caddyfile` contém `local_certs`, `auto_https disable_redirects`, `intermediate_lifetime 3000d` e emissor interno com `lifetime 2999d`. Não há redirect 80→443 garantido nessa configuração. As validades dos arquivos não correspondem exatamente às durações hoje escritas; não reconstruir uma suposta história de emissão a partir disso.

**[CONFIRMADO]** Roteamento real: `/api` com remoção de prefixo para 127.0.0.1:3000; `/socket.io` para 3000; frontend para 5173/admin 5174; host updates serve `C:\caddy\updates`.

**[CONFIRMADO]** Tarefa `BHash-Caddy-Start` executa como SYSTEM: `C:\caddy\caddy.exe start --config "C:\caddy\Caddyfile" --adapter caddyfile`. Script de instalação não define explicitamente data-dir. **[INFERIDO]** Trocar usuário/perfil após formatação pode selecionar outro armazenamento e gerar outra CA.

**[PLANEJADO]** Preservar Caddyfile, data-dir completo e identidade privada em backup restrito antes de reinstalar tarefas. Confirmar o storage do processo de serviço; o perfil do usuário inventariado não basta para provar isso. Não iniciar Caddy automaticamente antes dessa decisão.

## Nginx preparado para Linux

**[CONFIRMADO]** `docs/nginx/bhash-internal.conf` e `scripts/deploy/lib/tenant-config.cjs:295` geram vhosts 80/443. Usam arquivos em `/etc/ssl/certs/<host>.crt` e `/etc/ssl/private/<host>.key`; esses caminhos são referências planejadas, não arquivos Linux verificados.

**[CONFIRMADO]** Config encaminha `/api/` retirando prefixo; `/socket.io/` preserva WS, headers Upgrade/Connection e timeout 600 s; `/` vai para 5173/5174. Limite `client_max_body_size 40m` diverge dos 250 MiB da aplicação. Gerador Nginx não contempla feed desktop `/desktop/win`, ao contrário do Caddy gerado.

**[PLANEJADO]** Antes de ativar Nginx, completar rota de distribuição, ajustar limites, definir permissões de chave/usuário, testar configuração, cadeia/SAN, WebSocket e endpoints de mídia. Não basta copiar Caddyfile para Nginx.

## Renovação e confiança

- **[CONFIRMADO]** Caddy está configurado com emissor interno; **[INFERIDO]** pretende administrar emissão/renovação local pelo seu storage. **[DESCONHECIDO]** Renovação real sob a conta atual não foi testada.
- **[CONFIRMADO]** Não foi encontrado script Certbot/ACME/renew versionado. O Nginx referencia arquivos, mas não emite/renova por si nesse projeto.
- **[PLANEJADO]** Para Linux, escolher CA corporativa/interna e processo de renovação com instalação atômica de cert/key e reload verificado, ou outra estratégia explicitamente aprovada. ACME público não deve ser presumido para nomes internos como `bashchat`/`.condominious`.
- **[PLANEJADO]** Agendar controle de validade e teste da renovação. Distribuir aos clientes apenas a CA pública necessária, nunca `root.key`/chaves folhas. Se a CA for recriada, redistribuir confiança será necessário.

O armazenamento e a confiança da CA são partes essenciais do HTTPS local; o Caddy não torna automaticamente todos os dispositivos clientes confiantes na CA. [Documentação oficial Caddy](https://caddyserver.com/docs/automatic-https).

## Exceções de validação já no código

**[CONFIRMADO]** Electron aceita certos erros TLS para hosts configurados em `desktop-electron/src/main.js:221–272`. Scripts Windows têm opção `AllowInsecureTls`. Isso não equivale a validação correta da cadeia. **[PLANEJADO]** Revisar essas exceções antes de distribuição; não recomendá-las como solução permanente ao reconstruir confiança.

**[CONFIRMADO]** Nenhum certificado foi criado, renovado, importado, exportado, modificado ou removido durante esta tarefa.
