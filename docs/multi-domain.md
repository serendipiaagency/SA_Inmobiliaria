# Multiagencia por dominio

Cada organización (inmobiliaria) de la plataforma puede publicar su propio
sitio en su propio dominio, sirviendo únicamente su catálogo, su marca y sus
formularios — sin que las demás organizaciones sean visibles ni accesibles
desde ahí. Este documento cubre cómo funciona la resolución de dominio y los
pasos manuales en Cloudflare que no se pueden hacer desde el código.

## Cómo se resuelve el tenant

`server/middleware/00.tenant.ts` corre primero en cada petición (antes que
cualquier ruta) y decide, a partir del `Host` de la petición, qué
organización sirve esa petición:

1. **Dominio conocido** — el `Host` (normalizado) coincide con
   `organizations.domain` de alguna organización → esa organización sirve la
   petición: su catálogo, su sitemap, sus formularios públicos.
2. **Host primario** — el `Host` es el `*.workers.dev` que Cloudflare asigna
   gratis a cada entorno (incluido staging), `localhost` (desarrollo), o el
   `PRIMARY_DOMAIN` opcional configurado en `wrangler.toml` → sirve la
   organización por defecto (id 1).
3. **Dominio desconocido** — cualquier otro host → **404** en toda la
   superficie pública (sitio público, `/api/public/*`, `/sitemap.xml`,
   `/robots.txt`). El panel admin (`/admin/*`, `/api/admin/*`) y los assets
   estáticos siguen accesibles desde cualquier host — un super_admin tiene
   que poder entrar a asignar un dominio *antes* de que ese dominio esté
   configurado en ningún sitio.

En el dominio propio de una organización, `/` sirve directamente el portal
inmobiliario de esa organización (ver `docs/url-migration.md`); en el host
primario sigue mostrando la landing SaaS de la plataforma.

Antes de esto, cualquier host no reconocido caía silenciosamente al tenant
por defecto: un DNS mal configurado, un dominio retirado de una organización
y no reasignado, o un simple typo servían igualmente el catálogo completo de
la organización 1. El paso 3 cierra ese hueco.

`server/utils/domain.ts` tiene la lógica pura (normalización, host primario,
host reservado) y `test/unit/domain.test.ts` la cubre. El comportamiento de
extremo a extremo está en `tests/e2e/domain-routing.spec.ts`.

### Normalización

`www.midominio.com`, `MiDominio.com` y `midominio.com:443` se tratan como el
mismo host (minúsculas, sin puerto, sin `www.`). El valor se normaliza igual
en ambos lados: al guardarlo en `/admin/organizations` (campo Dominio) y al
leer el `Host` de cada petición — así una organización solo necesita guardar
`midominio.com`, no las dos variantes.

## Asignar un dominio a una organización

1. **Cloudflare Dashboard → Workers & Pages → sa-inmobiliaria → Settings →
   Domains & Routes → Custom Domains** — añadir el dominio del cliente
   (p. ej. `www.inmobiliariacliente.com`). Cloudflare emite el certificado
   TLS automáticamente si el dominio ya usa sus nameservers; si no, pide
   añadir el registro DNS que indique (normalmente un `CNAME` a
   `sa-inmobiliaria.<subdominio>.workers.dev`, o una `A`/`AAAA` si el dominio
   está en otro proveedor y solo se apunta el subdominio vía Cloudflare).
2. Esperar a que el estado pase a **Active** (propagación DNS + emisión de
   certificado — minutos, hasta 24h en casos raros).
3. **`/admin/organizations`** (solo super_admin) → editar la organización →
   campo **Dominio**: el mismo valor exacto del paso 1 (con o sin `www.`, es
   indiferente — ver normalización arriba). Guardar.
4. Verificar visitando el dominio: debe mostrar el catálogo de *esa*
   organización, no el de la organización por defecto.

Sin el paso 3, Cloudflare enruta el tráfico al Worker pero la aplicación no
sabe a qué organización pertenece ese host — cae en el caso "dominio
desconocido" (404) descrito arriba. Sin el paso 1, el dominio nunca llega al
Worker en absoluto (es un problema de DNS/Cloudflare, no de esta aplicación).

### Dominios que no se pueden asignar

`/admin/organizations` rechaza (422) guardar como dominio de una
organización cualquiera de estos, porque ya tienen un significado especial
(host "primario", resuelven a la organización por defecto — ver arriba):

- Cualquier `*.workers.dev`
- `localhost` / `127.0.0.1`

También rechaza un valor que no tenga forma de hostname real (sin punto, con
espacios, con esquema `http://`, etc.).

## Slugs por organización, no globales

Los slugs de proyectos (`developer_properties`), propiedades de reventa
(`agent_properties`), posts del blog (`blogs`) y miembros de equipo
(`team_members`) son únicos **por organización**, no globalmente
(migración `0042_scoped_slugs_and_domain.sql`). Antes de esa migración, dos
inmobiliarias distintas no podían usar el mismo slug (p. ej.
`downtown-loft`) aunque no tuvieran ninguna relación entre sí: la segunda en
guardarlo recibía un error 500 causado enteramente por el dato de una
inmobiliaria ajena — un problema real una vez que cada inquilino tiene su
propio dominio y, por tanto, su propio espacio de URLs. `test/unit/multitenant.slugScoping.test.ts`
cubre que dos organizaciones pueden compartir un slug y que una misma
organización sigue sin poder repetirlo.

## Qué queda fuera de este bloque

- **Branding por organización en las páginas `/demo/*`** (reemplazar el
  nombre/logo/color fijo "M&M Real Estate" por los de `organizations.logo` /
  `.brandColor` / `.companyName` en cada plantilla) — la resolución de
  dominio ya deja la organización correcta en `event.context.org` en cada
  petición; queda pendiente conectar esos valores en las plantillas mismas,
  junto con la salida general del estado de demo.
- **DNS wildcard / subdominios automáticos** (`*.sa-inmobiliaria.com` →
  organización por slug) no está implementado; cada dominio se añade a mano
  como Custom Domain, uno por organización.
