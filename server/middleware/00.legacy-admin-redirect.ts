// El módulo de comerciales vivía en dos sitios con tres nombres: el menú
// decía "Comerciales" pero la ruta era /admin/agents, y /admin/team ("Equipo")
// editaba el horario de esas mismas personas — las dos sobre `team_members`.
// Ahora hay un solo módulo, /admin/comerciales, con el horario como subruta
// de la ficha. Esto lleva las URLs antiguas a la nueva en un solo salto.
//
// Existe porque son URLs que la gente tiene guardadas en marcadores y pegadas
// en correos internos: renombrar sin redirigir las rompe en silencio.
// Mismo planteamiento que 00.legacy-demo-redirect.ts, que hace lo propio con
// las rutas públicas; este cubre /admin, que aquel excluye expresamente.
//
// 301 (permanente) porque el cambio lo es: no hay intención de devolver
// /admin/agents ni /admin/team.
const RULES: Array<{ match: RegExp; to: (m: RegExpMatchArray) => string }> = [
  // El horario de un comercial: el id va en medio de la ruta nueva, así que
  // no vale un intercambio de prefijo.
  { match: /^\/admin\/team\/(\d+)$/, to: (m) => `/admin/comerciales/${m[1]}/horario` },
  // "Equipo" era solo un listado para llegar a esos horarios; la lista de
  // comerciales ya cumple esa función.
  { match: /^\/admin\/team$/, to: () => '/admin/comerciales' },
  { match: /^\/admin\/agents(\/.*)?$/, to: (m) => `/admin/comerciales${m[1] || ''}` },
]

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return
  const url = getRequestURL(event)
  // Sólo rutas de página. `/api/admin/team` y `/api/admin/agents` siguen
  // siendo los endpoints reales y no se tocan: el cambio es de vocabulario y
  // de navegación, no del contrato de la API.
  if (!url.pathname.startsWith('/admin/')) return

  for (const rule of RULES) {
    const m = url.pathname.match(rule.match)
    if (m) return sendRedirect(event, `${rule.to(m)}${url.search}`, 301)
  }
})
