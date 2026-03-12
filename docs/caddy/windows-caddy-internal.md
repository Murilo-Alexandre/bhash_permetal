# Caddy Interno no Windows (HTTPS + PWA)

Guia pratico para publicar o BHASH em rede interna com HTTPS confiavel e instalacao PWA.

## Cenário alvo

- Chat: `https://chat.empresa.local`
- Admin: `https://admin-chat.empresa.local` (opcional)
- Backend/API/Socket expostos apenas localmente (`127.0.0.1`)
- Sem publicacao na internet

## 1) Subir a aplicacao em modo proxy interno

Na raiz do projeto:

```powershell
npm run setup:server
npm run services:start:proxy
npm run services:save
```

Esse modo deixa:

- backend em `127.0.0.1:3000`
- chat em `127.0.0.1:5173`
- admin em `127.0.0.1:5174`

## 2) Instalar Caddy

Baixe o binario e coloque em `C:\caddy\caddy.exe`.

## 3) Criar o Caddyfile

Arquivo: `C:\caddy\Caddyfile`

```caddyfile
{
    local_certs
    auto_https disable_redirects
}

https://chat.empresa.local {
    encode zstd gzip

    @api path /api/*
    handle @api {
        uri strip_prefix /api
        reverse_proxy 127.0.0.1:3000
    }

    @socket path /socket.io/*
    handle @socket {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        reverse_proxy 127.0.0.1:5173
    }
}

https://admin-chat.empresa.local {
    encode zstd gzip

    @api path /api/*
    handle @api {
        uri strip_prefix /api
        reverse_proxy 127.0.0.1:3000
    }

    @socket path /socket.io/*
    handle @socket {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        reverse_proxy 127.0.0.1:5174
    }
}
```

`auto_https disable_redirects` evita conflito quando a porta `80` ja esta ocupada por IIS/HTTP.sys.

## 4) Iniciar Caddy

```powershell
C:\caddy\caddy.exe validate --config C:\caddy\Caddyfile --adapter caddyfile
C:\caddy\caddy.exe start --config C:\caddy\Caddyfile --adapter caddyfile
```

Para parar:

```powershell
C:\caddy\caddy.exe stop
```

## 5) Resolver DNS interno (obrigatorio para celular)

Para laboratorio rapido, no Windows local:

`C:\Windows\System32\drivers\etc\hosts`

```txt
192.168.1.10 chat.empresa.local
192.168.1.10 admin-chat.empresa.local
```

Para uso real em empresa, configure no DNS interno (AD DNS/Firewall/Router):

- A `chat.empresa.local` -> `192.168.1.10`
- A `admin-chat.empresa.local` -> `192.168.1.10`

Sem DNS interno, o celular nao encontra o host.

## 6) Confiar no certificado em cada dispositivo

Caddy cria uma CA local em:

`%AppData%\Caddy\pki\authorities\local\root.crt`

### Windows

A primeira subida do Caddy normalmente ja instala essa CA no trust store.

### Android

1. Copie `root.crt` para o celular.
2. Configuracoes -> Seguranca -> Criptografia e credenciais -> Instalar certificado (CA).
3. Confirme o aviso.
4. Reabra o Chrome.

### iOS

1. Envie `root.crt` para o iPhone.
2. Abra o arquivo e instale o perfil.
3. Ajustes -> Geral -> Sobre -> Ajustes de Confianca de Certificados.
4. Ative confianca total para a CA instalada.

## 7) Checklist

1. `https://chat.empresa.local` abre sem alerta de certificado.
2. Login funciona (API via `/api`).
3. Realtime funciona (Socket.IO via `/socket.io`).
4. Android mostra opcao `Instalar app`.
5. iOS: `Compartilhar -> Adicionar a Tela de Inicio`.

## 8) Erros comuns

- `ERR_SSL_PROTOCOL_ERROR`:
  - voce abriu `https://` numa porta/app sem TLS; acesse via host do Caddy.
- abre como aba comum no Chrome:
  - sem HTTPS confiavel ou sem service worker ativo.
- `Blocked request. This host is not allowed`:
  - Vite bloqueando host externo (corrigido no projeto com `allowedHosts: true`).
