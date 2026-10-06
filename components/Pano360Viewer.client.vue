<template>
  <div
    ref="wrap"
    class="relative h-full w-full touch-none select-none outline-none"
    :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
    role="img"
    :aria-label="alt"
    tabindex="0"
    data-testid="pano-360"
    :data-mode="mode"
    @keydown="onKey"
  >
    <canvas
      v-show="mode === 'webgl'"
      ref="canvas"
      class="block h-full w-full"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel.prevent="onWheel"
    />
    <!-- Sin WebGL: la foto se recorre en horizontal y da la vuelta entera. -->
    <div
      v-if="mode === 'flat'"
      class="h-full w-full bg-repeat-x"
      :style="{ backgroundImage: `url(${src})`, backgroundSize: 'auto 100%', backgroundPositionX: `${flatX}px` }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    />
    <div v-if="mode === 'loading'" class="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-widest2 text-white/70">
      {{ t('mediaGallery.tour360.loading', 'Cargando la foto 360…') }}
    </div>
    <div v-if="mode === 'error'" class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80">
      {{ t('mediaGallery.tour360.error', 'No se ha podido cargar la foto 360.') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { clampFov, clampPitch, dragDelta, PANO_DEFAULT_FOV, wrapYaw } from '~/utils/pano360'

/**
 * Visor 360 esférico (FASE 7) sin dependencias: un único triángulo a pantalla
 * completa y un shader que, para cada píxel, calcula la dirección de la
 * cámara y lee ese punto de la foto equirectangular (la misma matemática que
 * `utils/pano360.ts`, que es la que tiene tests). Se arrastra para mirar
 * alrededor, la rueda o el pellizco acercan, y las flechas y +/- también
 * funcionan con teclado. Sólo dibuja cuando algo cambia.
 *
 * Si el navegador no tiene WebGL (o pierde el contexto), la foto se recorre
 * en horizontal, como antes.
 */
const props = defineProps<{ src: string; alt: string }>()
const { t } = useI18n()

const wrap = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const mode = ref<'loading' | 'webgl' | 'flat' | 'error'>('loading')
const dragging = ref(false)
const flatX = ref(0)

const view = { yaw: 0, pitch: 0, fov: PANO_DEFAULT_FOV }
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let texture: WebGLTexture | null = null
let uniforms: Record<'yaw' | 'pitch' | 'tanHalf' | 'aspect', WebGLUniformLocation | null> = { yaw: null, pitch: null, tanHalf: null, aspect: null }
let frame = 0
let resizeObserver: ResizeObserver | null = null
let loadToken = 0

const VERTEX = `
attribute vec2 aPos;
varying vec2 vPos;
void main() {
  vPos = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform float uYaw;
uniform float uPitch;
uniform float uTanHalf;
uniform float uAspect;
varying vec2 vPos;
const float PI = 3.141592653589793;
void main() {
  vec3 d = vec3(vPos.x * uTanHalf * uAspect, vPos.y * uTanHalf, -1.0);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  d = normalize(vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy));
  float lon = atan(d.x, -d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  gl_FragColor = texture2D(uTex, vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI));
}`

function compile(type: number, source: string): WebGLShader | null {
  if (!gl) return null
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function setupGl(): boolean {
  const el = canvas.value
  if (!el) return false
  try {
    gl = (el.getContext('webgl', { antialias: false, alpha: false }) || el.getContext('experimental-webgl')) as WebGLRenderingContext | null
  } catch {
    gl = null
  }
  if (!gl) return false
  const vs = compile(gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vs || !fs) return false
  program = gl.createProgram()
  if (!program) return false
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false
  gl.useProgram(program)
  // Un triángulo que cubre toda la pantalla.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  uniforms = {
    yaw: gl.getUniformLocation(program, 'uYaw'),
    pitch: gl.getUniformLocation(program, 'uPitch'),
    tanHalf: gl.getUniformLocation(program, 'uTanHalf'),
    aspect: gl.getUniformLocation(program, 'uAspect'),
  }
  el.addEventListener('webglcontextlost', onContextLost)
  return true
}

function onContextLost(e: Event) {
  e.preventDefault()
  gl = null
  mode.value = 'flat'
}

/** Las fotos 360 suelen pasar del tamaño máximo de textura de un móvil: se reducen sin deformarlas. */
function fitToTexture(img: HTMLImageElement): TexImageSource {
  const max = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096 : 4096
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w <= max && h <= max) return img
  const scale = Math.min(max / w, max / h)
  const c = document.createElement('canvas')
  c.width = Math.floor(w * scale)
  c.height = Math.floor(h * scale)
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
  return c
}

function loadImage(src: string) {
  const token = ++loadToken
  if (gl) mode.value = 'loading'
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    if (token !== loadToken) return
    if (!gl) {
      mode.value = 'flat'
      return
    }
    if (texture) gl.deleteTexture(texture)
    texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    // Las fotos 360 rara vez miden potencias de dos: sin mipmaps y sin REPEAT
    // (WebGL 1 no los permite); la vuelta completa la hace `fract` en el shader.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, fitToTexture(img))
    } catch {
      mode.value = 'flat'
      return
    }
    mode.value = 'webgl'
    // El lienzo estaba oculto mientras cargaba: se mide cuando ya se ve.
    nextTick(resize)
  }
  img.onerror = () => {
    if (token === loadToken) mode.value = 'error'
  }
  img.src = src
}

function resize() {
  const el = canvas.value
  if (!el || !gl) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round(el.clientWidth * dpr))
  const h = Math.max(1, Math.round(el.clientHeight * dpr))
  if (el.width !== w || el.height !== h) {
    el.width = w
    el.height = h
  }
  requestDraw()
}

function requestDraw() {
  if (frame || !gl) return
  frame = requestAnimationFrame(() => {
    frame = 0
    draw()
  })
}

function draw() {
  const el = canvas.value
  if (!gl || !program || !texture || !el) return
  gl.viewport(0, 0, el.width, el.height)
  gl.uniform1f(uniforms.yaw, view.yaw)
  gl.uniform1f(uniforms.pitch, view.pitch)
  gl.uniform1f(uniforms.tanHalf, Math.tan(view.fov / 2))
  gl.uniform1f(uniforms.aspect, el.width / Math.max(1, el.height))
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function rotate(dYaw: number, dPitch: number) {
  view.yaw = wrapYaw(view.yaw + dYaw)
  view.pitch = clampPitch(view.pitch + dPitch)
  requestDraw()
}

function zoom(factor: number) {
  view.fov = clampFov(view.fov * factor)
  requestDraw()
}

// Arrastrar con un dedo o el ratón; pellizcar con dos.
const pointers = new Map<number, { x: number; y: number }>()
let pinchStart = 0
let pinchFov = view.fov

function onDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  dragging.value = true
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    pinchFov = view.fov
  }
}

function onMove(e: PointerEvent) {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  const next = { x: e.clientX, y: e.clientY }
  pointers.set(e.pointerId, next)
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    if (pinchStart > 0 && dist > 0) {
      view.fov = clampFov(pinchFov * (pinchStart / dist))
      requestDraw()
    }
    return
  }
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  if (mode.value === 'flat') {
    flatX.value += dx
    return
  }
  const height = canvas.value?.clientHeight || 540
  const d = dragDelta(dx, dy, height, view.fov)
  rotate(d.yaw, d.pitch)
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchStart = 0
  if (!pointers.size) dragging.value = false
}

function onWheel(e: WheelEvent) {
  zoom(Math.exp(e.deltaY * 0.001))
}

const STEP = (5 * Math.PI) / 180
function onKey(e: KeyboardEvent) {
  const actions: Record<string, () => void> = {
    ArrowLeft: () => (mode.value === 'flat' ? (flatX.value += 40) : rotate(STEP, 0)),
    ArrowRight: () => (mode.value === 'flat' ? (flatX.value -= 40) : rotate(-STEP, 0)),
    ArrowUp: () => rotate(0, STEP),
    ArrowDown: () => rotate(0, -STEP),
    '+': () => zoom(0.9),
    '=': () => zoom(0.9),
    '-': () => zoom(1 / 0.9),
  }
  const action = actions[e.key]
  if (!action) return
  e.preventDefault()
  action()
}

onMounted(() => {
  if (!setupGl()) {
    gl = null
    mode.value = 'flat'
  }
  resizeObserver = new ResizeObserver(resize)
  if (canvas.value) resizeObserver.observe(canvas.value)
  loadImage(props.src)
})

watch(
  () => props.src,
  (src) => {
    view.yaw = 0
    view.pitch = 0
    view.fov = PANO_DEFAULT_FOV
    flatX.value = 0
    loadImage(src)
  },
)

onBeforeUnmount(() => {
  loadToken++
  if (frame) cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  canvas.value?.removeEventListener('webglcontextlost', onContextLost)
  if (gl) {
    if (texture) gl.deleteTexture(texture)
    // Libera la memoria de la GPU al salir de la pestaña 360.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  gl = null
})
</script>
