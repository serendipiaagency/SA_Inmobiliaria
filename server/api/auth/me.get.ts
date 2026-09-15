import { getSessionUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  // `devAuthBypass` avisa al panel de que esta sesión no viene de un login
  // real, para que lo diga en pantalla en vez de estar encendido en silencio
  // (server/utils/auth.ts → devBypassUser). Como `import.meta.dev` es una
  // constante de compilación, en el build de producción esto es
  // literalmente `false` y desaparece.
  const devAuthBypass = import.meta.dev && Boolean((event.context as any).cloudflare?.env?.DEV_AUTH_BYPASS)
  return { user, devAuthBypass }
})
