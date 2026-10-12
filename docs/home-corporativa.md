# Home corporativa: la inmobiliaria detrás del catálogo

Bloques del Constructor Web con los que la portada de cada inmobiliaria deja
de ser un portal genérico de viviendas y cuenta quién está detrás: la agencia,
sus argumentos, su equipo y sus oficinas. Todo se configura por inmobiliaria
desde el Constructor (activar, textos, imágenes, orden, cifras, comerciales y
oficinas destacados, CTAs y enlaces) y nada se inventa: las cifras salen de
los datos reales de la cuenta y una oficina sin horario o sin coordenadas
simplemente no enseña horario ni mapa.

## Modelo: oficinas en la web (migración 0096)

La tabla `offices` (migraciones 0086 y 0090) tenía nombre, código, contacto,
dirección, zona horaria, estado y foto, pero nada de lo que una web necesita
para presentar una oficina. La migración `0096_oficinas_en_la_web.sql` **sólo
añade** columnas:

| Columna | Qué guarda |
|---|---|
| `description` | Presentación corta de la oficina. `NULL` = no se enseña. |
| `opening_hours` | Horario de atención, texto libre («L-V 9:30-18:30 · S 10:00-14:00»). `NULL` = no se enseña. |
| `lat`, `lng` | Centro del mapa de la oficina. Sin coordenadas no hay mapa ni `geo` en los datos estructurados; la dirección sigue enlazando a un mapa externo. |
| `is_main` | `1` en la oficina principal (una por inmobiliaria). |
| `show_on_web` | `0` retira la oficina de la web sin tocar el CRM. Por defecto `1`. |
| `sort_order` | Orden en la web (menor primero). |

Ninguna fila existente cambia de comportamiento: los textos y coordenadas
quedan en `NULL`, `is_main` en 0, `show_on_web` en 1 (toda oficina activa ya
salía en el pie de página) y `sort_order` en 0.

## Despliegue

La migración va en su propio PR y se aplica en producción antes del código
que lee las columnas (lección del 2026-09-15, ver CLAUDE.md). Los bloques, la
página `/oficinas`, los campos del panel, los datos estructurados y la
portada de la demo se documentan aquí cuando se publiquen.
