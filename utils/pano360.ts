/**
 * Visor 360 esférico (FASE 7): la matemática de la vista, en una sola fuente.
 *
 * Una foto 360 es una proyección equirectangular: el ancho recorre la
 * longitud (-180°…180°) y el alto la latitud (90°…-90°). Para cada píxel de
 * la pantalla se calcula la dirección en la que mira la cámara (guiñada
 * `yaw`, cabeceo `pitch`, campo de visión `fov`) y se lee el punto de la foto
 * que hay en esa dirección. El shader de `components/Pano360Viewer.client.vue`
 * hace exactamente estas cuentas en la GPU; aquí están en JS para probarlas.
 */
export const PANO_MIN_FOV = (30 * Math.PI) / 180
export const PANO_MAX_FOV = (100 * Math.PI) / 180
export const PANO_DEFAULT_FOV = (75 * Math.PI) / 180
/** Sin llegar a ±90°: mirar justo al polo hace que la guiñada deje de tener sentido. */
export const PANO_MAX_PITCH = (85 * Math.PI) / 180

export function clampPitch(pitch: number): number {
  return Math.max(-PANO_MAX_PITCH, Math.min(PANO_MAX_PITCH, pitch))
}

export function clampFov(fov: number): number {
  return Math.max(PANO_MIN_FOV, Math.min(PANO_MAX_FOV, fov))
}

/** La guiñada se mantiene en (-π, π] para que no crezca sin fin al dar vueltas. */
export function wrapYaw(yaw: number): number {
  const twoPi = Math.PI * 2
  let y = yaw % twoPi
  if (y > Math.PI) y -= twoPi
  if (y <= -Math.PI) y += twoPi
  return y
}

/**
 * Dirección (normalizada) que ve el píxel `(sx, sy)` de la pantalla, con
 * `sx`, `sy` en [-1, 1] (centro = 0, arriba = +1).
 */
export function viewDirection(sx: number, sy: number, yaw: number, pitch: number, fov: number, aspect: number): [number, number, number] {
  const t = Math.tan(fov / 2)
  // Cámara mirando a -Z, con Y hacia arriba.
  const x0 = sx * t * aspect
  const y0 = sy * t
  const z0 = -1
  // Cabeceo: giro alrededor de X.
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const x1 = x0
  const y1 = y0 * cp - z0 * sp
  const z1 = y0 * sp + z0 * cp
  // Guiñada: giro alrededor de Y.
  const cy = Math.cos(yaw)
  const sy2 = Math.sin(yaw)
  const x2 = x1 * cy + z1 * sy2
  const z2 = -x1 * sy2 + z1 * cy
  const len = Math.hypot(x2, y1, z2)
  return [x2 / len, y1 / len, z2 / len]
}

/** Punto de la foto equirectangular (u, v en [0, 1), v = 0 arriba) que hay en una dirección. */
export function equirectUV(dir: [number, number, number]): [number, number] {
  const [x, y, z] = dir
  const lon = Math.atan2(x, -z)
  const lat = Math.asin(Math.max(-1, Math.min(1, y)))
  let u = lon / (2 * Math.PI) + 0.5
  u -= Math.floor(u)
  const v = 0.5 - lat / Math.PI
  return [u, v]
}

/**
 * Cuánto gira la vista al arrastrar `dx`, `dy` píxeles en un lienzo de alto
 * `height`: la foto sigue al dedo. Arrastrar a la derecha trae al centro lo
 * que había a la izquierda (guiñada positiva); arrastrar hacia abajo, lo que
 * había arriba (cabeceo positivo).
 */
export function dragDelta(dx: number, dy: number, height: number, fov: number): { yaw: number; pitch: number } {
  const perPixel = fov / Math.max(1, height)
  return { yaw: dx * perPixel, pitch: dy * perPixel }
}
