# Enabling TLS on the ERP

The stack currently serves plain **HTTP on port 80**. Everything needed to turn
on HTTPS is in place except the certificate itself, which needs your domain and
a DNS record pointing at this host — neither of which can be provisioned from
the repository.

This is deliberately a two-step process. Certbot's http-01 challenge needs
port 80 reachable and **not** redirecting to HTTPS, so the redirect can only be
switched on after the certificate exists. Enabling both at once is the usual
way this fails.

## Before you start

- A domain (say `erp.yourcompany.com`) with an A record pointing at this host.
- Port 80 open to the internet. Let's Encrypt validates from outside; it cannot
  reach a loopback-bound port.
- `TLS_DOMAIN` and `TLS_EMAIL` set in your `.env.erp`:

  ```
  TLS_DOMAIN=erp.yourcompany.com
  TLS_EMAIL=you@yourcompany.com
  ```

## Step 1 — issue the certificate

With the stack running on port 80:

```bash
docker compose -f docker-compose.erp.yml --env-file .env.erp --profile tls run --rm erp-certbot
```

Certbot writes the challenge into the shared `nginx/acme` volume, which nginx
already serves at `/.well-known/acme-challenge/`. On success the certificate
lands in `nginx/certs/live/$TLS_DOMAIN/`.

If this fails, it is almost always one of: DNS not yet propagated, port 80 not
reachable from outside, or a redirect already in place on `/`.

## Step 2 — turn on the 443 listener

```bash
cd nginx/tls
cp ssl.conf.example ssl.conf
# replace erp.example.com with your domain (four places)
sed -i "s/erp.example.com/$TLS_DOMAIN/g" ssl.conf
cd ../..
docker compose -f docker-compose.erp.yml --env-file .env.erp restart erp-nginx
```

`ssl.conf` is picked up by the `include /etc/nginx/conf.d/tls/*.conf` in
`erp.conf`. While the file is named `.example` the include matches nothing and
nginx starts normally — which is what keeps step 1 working.

Verify before moving on:

```bash
curl -sSI https://$TLS_DOMAIN/healthz | head -1
curl -sSI http://$TLS_DOMAIN/  | grep -i location   # should show the 301
```

## Step 3 — renewal

Certificates last 90 days. Add a cron entry on the host:

```
0 3 * * * cd /path/to/Gemera_ecomm && docker compose -f docker-compose.erp.yml --env-file .env.erp --profile tls run --rm erp-certbot renew --quiet && docker compose -f docker-compose.erp.yml --env-file .env.erp exec -T erp-nginx nginx -s reload
```

## About HSTS

`ssl.conf.example` sets `Strict-Transport-Security: max-age=86400` — one day,
on purpose. HSTS tells browsers to refuse plain HTTP for that domain, and they
honour it even if your certificate later breaks. Prove renewal works for a few
cycles, then raise it (`max-age=31536000`). Do not add `preload` until you are
certain: entries are slow and awkward to reverse.

## What this does not cover

- The **storefront and admin** stacks (`docker-compose.backend.yml`,
  `docker-compose.frontend.yml`) still have no TLS. They need the same
  treatment.
- Internal traffic between containers is still plain HTTP. That is acceptable
  on a private Docker network but not across hosts.
- The database connection does not use TLS. If the DB ever moves off this host,
  it must.
