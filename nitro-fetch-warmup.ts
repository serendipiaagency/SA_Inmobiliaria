/**
 * Absorbe el coste único de comprobación de tipos de las rutas de Nitro.
 *
 * ## Qué problema resuelve
 *
 * Nitro tipa `$fetch` y `useFetch` contra la lista de rutas del proyecto: dada
 * una URL, `MatchedRoutes` la puntúa contra **todas** las claves de
 * `InternalApi`, segmento a segmento, para deducir el tipo de la respuesta
 * (ver `MatchedRoutes` / `CalcMatchScore` en
 * node_modules/nitropack/dist/types/index.d.ts).
 *
 * Ese trabajo se hace **una sola vez** para todo el proyecto: TypeScript lo
 * memoriza y el resto de llamadas reutiliza el resultado. Pero el presupuesto
 * de instanciaciones de TypeScript (5.000.000) se reinicia en **cada
 * sentencia**, así que la factura entera se le carga a la primera sentencia
 * que use `$fetch`/`useFetch` — y a partir de cierto número de rutas esa
 * sentencia sola se pasa del límite y falla con
 * `TS2589: Type instantiation is excessively deep and possibly infinite`.
 *
 * Lo desagradable es a quién le toca pagar: al primer fichero en el orden en
 * que TypeScript recorre el proyecto. No al fichero que se acaba de tocar, ni
 * a la ruta que se acaba de añadir. Medido en este repositorio:
 *
 * | claves de ruta | sin este fichero        | con este fichero |
 * | -------------- | ----------------------- | ---------------- |
 * | 197 (hoy)      | limpio                  | limpio           |
 * | 198            | limpio                  | limpio           |
 * | 199            | **TS2589** + cascada    | limpio           |
 * | 347            | —                       | limpio           |
 *
 * Es decir: antes de este fichero, **una sola ruta nueva** rompía
 * `npm run typecheck`, y lo hacía señalando un componente que nadie había
 * tocado. Y si a quien le tocaba pagar era una llamada escrita como
 * `$fetch<any>(...)`, el error único se convertía en 35 errores repartidos por
 * 19 ficheros, porque `any` obliga a evaluar las dos ramas de la condicional
 * que normalmente cortocircuita el tipado (`TypedInternalResponse`) y
 * contamina la firma para todo el resto. Por eso, si tienes que elegir un tipo
 * para una respuesta, declara su forma real en lugar de `any`.
 *
 * ## Cómo lo resuelve
 *
 * La llamada de abajo es la primera que TypeScript encuentra (los ficheros de
 * la raíz se recorren antes que cualquier subdirectorio), así que es ella la
 * que paga y la única que se pasa del presupuesto. Se silencia ese único
 * diagnóstico y, con el resultado ya memorizado, todas las llamadas reales del
 * proyecto se comprueban por debajo del límite.
 *
 * Invariantes que hacen que esto funcione — las verifica
 * test/unit/nitroFetchWarmup.test.ts, que falla explicando esto mismo:
 *
 *  1. Este fichero vive en la raíz del proyecto.
 *  2. Ningún otro fichero de la raíz usa `$fetch`/`useFetch` antes que él por
 *     orden alfabético.
 *
 * ## Coste en ejecución: ninguno
 *
 * Nada importa este módulo, así que no entra en ningún bundle ni en el Worker.
 * La función no se llama nunca; sólo existe para que el comprobador de tipos
 * tenga una sentencia que analizar.
 */
export {}

async function warmNitroRouteMatcher() {
  // El `@ts-ignore` es el objetivo del fichero, no un parche: esta línea
  // existe precisamente para cargar con el TS2589 que si no le tocaría a un
  // componente cualquiera. No puede ser `@ts-expect-error` porque con pocas
  // rutas la línea no llega a error y TypeScript se quejaría de la directiva
  // sobrante.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return await $fetch('/api/admin/stats')
}

// Referenciada para que nadie la borre por "código muerto" sin leer lo de
// arriba. No se ejecuta.
void warmNitroRouteMatcher
