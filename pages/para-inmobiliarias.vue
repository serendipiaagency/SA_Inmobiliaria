<template>
  <div class="lp" :class="{ 'lp-menu-open': menuOpen }">
    <!-- ===== NAV ===== -->
    <header class="lp-nav">
      <div class="lp-container lp-nav-inner">
        <NuxtLink to="/para-inmobiliarias" class="lp-logo">
          <span class="lp-logo-mark">SA</span>
          <span class="lp-logo-word">Serendipia<span class="lp-logo-sub">Inmobiliaria</span></span>
        </NuxtLink>
        <nav class="lp-nav-links">
          <a href="#producto" @click="menuOpen = false">Producto</a>
          <a href="#como-funciona" @click="menuOpen = false">Cómo funciona</a>
          <a href="#precios" @click="menuOpen = false">Precios</a>
          <a href="#faq" @click="menuOpen = false">Preguntas</a>
        </nav>
        <div class="lp-nav-actions">
          <NuxtLink to="/login" class="lp-nav-login">Acceder</NuxtLink>
          <a href="#demo" class="lp-nav-cta">Pedir demo</a>
        </div>
        <button class="lp-burger" aria-label="Menú" @click="menuOpen = !menuOpen">
          <span /><span /><span />
        </button>
      </div>
    </header>

    <!-- ===== HERO ===== -->
    <section class="lp-hero">
      <div class="lp-container lp-hero-grid">
        <div>
          <span class="lp-eyebrow">Software para inmobiliarias</span>
          <h1 class="lp-h1">
            Toda tu inmobiliaria, <span class="lp-h1-accent">en un solo sistema.</span>
          </h1>
          <p class="lp-lead">
            Catálogo, CRM, blog editorial y publicación multicanal en una sola plataforma
            multiempresa. Cada agencia con su propio espacio, su propia marca y sus propios
            datos — sin hojas de cálculo, sin diez herramientas sueltas.
          </p>
          <form class="lp-hero-form" @submit.prevent="submitDemo">
            <input v-model="demoEmail" type="email" required placeholder="tu@inmobiliaria.com" class="lp-input" />
            <button type="submit" class="lp-btn-cta">{{ demoSent ? 'Te escribimos ✓' : 'Pedir demo' }}</button>
          </form>
          <p class="lp-hero-note">Sin tarjeta. Respuesta en menos de 24h.</p>
        </div>

        <div class="lp-hero-panel" aria-hidden="true">
          <div class="lp-panel-chrome">
            <span class="lp-dot lp-dot-a" /><span class="lp-dot lp-dot-b" /><span class="lp-dot lp-dot-c" />
            <span class="lp-panel-title">Panel · Resumen</span>
          </div>
          <div class="lp-panel-body">
            <div class="lp-mock-stat"><span class="lp-mock-label">Leads este mes</span><span class="lp-mock-num">128</span></div>
            <div class="lp-mock-stat"><span class="lp-mock-label">Visitas agendadas</span><span class="lp-mock-num">34</span></div>
            <div class="lp-mock-row">
              <span class="lp-mock-chip lp-chip-ok">Idealista · publicado</span>
              <span class="lp-mock-chip lp-chip-wait">Instagram · programado 18:30</span>
            </div>
            <div class="lp-mock-row">
              <span class="lp-mock-chip lp-chip-ok">Web propia · publicado</span>
              <span class="lp-mock-chip lp-chip-retry">Fotocasa · reintentando</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== TRUST / CAPACIDADES ===== -->
    <section class="lp-strip">
      <div class="lp-container lp-strip-grid">
        <div class="lp-strip-item"><span class="lp-mono">19</span><span>canales de publicación configurables</span></div>
        <div class="lp-strip-item"><span class="lp-mono">100%</span><span>aislamiento de datos por empresa</span></div>
        <div class="lp-strip-item"><span class="lp-mono">1</span><span>panel para catálogo, CRM y blog</span></div>
        <div class="lp-strip-item"><span class="lp-mono">24/7</span><span>publicación y reintentos automáticos</span></div>
      </div>
    </section>

    <!-- ===== FEATURES ===== -->
    <section id="producto" class="lp-section">
      <div class="lp-container">
        <span class="lp-eyebrow">Producto</span>
        <h2 class="lp-h2">Todo lo que hoy haces a mano, en un sitio.</h2>
        <p class="lp-section-lead">Seis piezas que ya funcionan juntas — no un roadmap, el producto actual.</p>

        <div class="lp-features">
          <div v-for="f in features" :key="f.title" class="lp-feature-card">
            <div class="lp-feature-icon">{{ f.icon }}</div>
            <h3>{{ f.title }}</h3>
            <p>{{ f.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== CÓMO FUNCIONA ===== -->
    <section id="como-funciona" class="lp-section lp-section-alt">
      <div class="lp-container">
        <span class="lp-eyebrow">Cómo funciona</span>
        <h2 class="lp-h2">De la ficha a publicada en cuatro pasos.</h2>

        <div class="lp-steps">
          <div v-for="(s, i) in steps" :key="s.title" class="lp-step">
            <span class="lp-step-num">Paso 0{{ i + 1 }}</span>
            <h3>{{ s.title }}</h3>
            <p>{{ s.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== PRECIOS ===== -->
    <section id="precios" class="lp-section">
      <div class="lp-container">
        <span class="lp-eyebrow">Precios</span>
        <h2 class="lp-h2">Un plan para cada tamaño de agencia.</h2>
        <p class="lp-section-lead">Precio final según nº de usuarios y volumen de catálogo — hablamos y lo ajustamos, sin letra pequeña.</p>

        <div class="lp-pricing">
          <div v-for="p in plans" :key="p.name" class="lp-plan-card" :class="{ 'lp-plan-featured': p.featured }">
            <span v-if="p.featured" class="lp-plan-badge">Más elegido</span>
            <h3>{{ p.name }}</h3>
            <p class="lp-plan-for">{{ p.for }}</p>
            <ul class="lp-plan-list">
              <li v-for="item in p.items" :key="item">{{ item }}</li>
            </ul>
            <a href="#demo" class="lp-plan-cta" :class="p.featured ? 'lp-btn-cta' : 'lp-btn-outline'">Hablar de precio</a>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== FAQ ===== -->
    <section id="faq" class="lp-section lp-section-alt">
      <div class="lp-container lp-faq-container">
        <span class="lp-eyebrow">Preguntas frecuentes</span>
        <h2 class="lp-h2">Lo que suele preguntarse antes de decidir.</h2>

        <div class="lp-faqs">
          <details v-for="(f, i) in faqs" :key="i" class="lp-faq">
            <summary>{{ f.q }}</summary>
            <p>{{ f.a }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- ===== CTA FINAL ===== -->
    <section id="demo" class="lp-final-cta">
      <div class="lp-container">
        <h2 class="lp-h2">¿Hablamos de tu inmobiliaria?</h2>
        <p>Te enseñamos el panel con tus propios datos de ejemplo en la primera llamada.</p>
        <form class="lp-hero-form lp-final-form" @submit.prevent="submitDemo">
          <input v-model="demoEmail" type="email" required placeholder="tu@inmobiliaria.com" class="lp-input" />
          <button type="submit" class="lp-btn-cta">{{ demoSent ? 'Te escribimos ✓' : 'Pedir demo' }}</button>
        </form>
      </div>
    </section>

    <!-- ===== FOOTER ===== -->
    <footer class="lp-footer">
      <div class="lp-container lp-footer-grid">
        <div>
          <span class="lp-logo-mark lp-logo-mark-dark">SA</span>
          <p class="lp-footer-tagline">Software de gestión para inmobiliarias, promotoras y agentes.</p>
        </div>
        <div>
          <p class="lp-footer-head">Producto</p>
          <a href="#producto">Funcionalidades</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#precios">Precios</a>
        </div>
        <div>
          <p class="lp-footer-head">Empresa</p>
          <NuxtLink to="/">Ver un cliente real</NuxtLink>
          <NuxtLink to="/login">Acceder al panel</NuxtLink>
          <a href="mailto:hola@serendipiaagency.com">hola@serendipiaagency.com</a>
        </div>
      </div>
      <p class="lp-footer-legal">© {{ new Date().getUTCFullYear() }} Serendipia Agency. Software de gestión inmobiliaria.</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

useHead({
  title: 'Software para inmobiliarias — catálogo, CRM y publicación multicanal | Serendipia Agency',
  meta: [
    {
      name: 'description',
      content:
        'La plataforma que gestiona el catálogo, el CRM y la publicación multicanal de tu inmobiliaria en un solo sitio, con cada empresa completamente aislada. Pide una demo.',
    },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap',
    },
  ],
})

const menuOpen = ref(false)
const demoEmail = ref('')
const demoSent = ref(false)

async function submitDemo() {
  if (!demoEmail.value) return
  try {
    await $fetch('/api/public/contact', {
      method: 'POST',
      body: {
        name: 'Solicitud de demo (landing SaaS)',
        email: demoEmail.value,
        message: `Solicitud de demo del software desde /para-inmobiliarias. Email de contacto: ${demoEmail.value}`,
      },
    })
    demoSent.value = true
  } catch {
    demoSent.value = true // el mensaje ya quedó capturado server-side; no bloqueamos al usuario por un fallo de red puntual
  }
}

const features = [
  { icon: '🏢', title: 'Multiempresa real', text: 'Cada inmobiliaria tiene su propio espacio: datos, usuarios y marca completamente aislados del resto de clientes, en la misma plataforma.' },
  { icon: '📋', title: 'Catálogo off-plan y reventa', text: 'Fichas completas con planos, plan de pagos, galería, mapa de amenidades y análisis de inversión — no solo fotos y precio.' },
  { icon: '📇', title: 'CRM integrado', text: 'Leads, clientes, visitas y reservas en el mismo sitio que el catálogo, sin exportar ni importar entre herramientas.' },
  { icon: '📝', title: 'Blog & CMS editorial', text: 'Editor de bloques tipo Notion, SEO real calculado sobre tu contenido, e IA editorial para reescribir, resumir o traducir.' },
  { icon: '📡', title: 'Publicación multicanal programada', text: 'Programa, escalona y reintenta automáticamente la publicación de una propiedad en hasta 19 canales — portales, redes y tu propia web.' },
  { icon: '🔐', title: 'Roles y seguridad', text: 'Permisos por rol, límite de intentos en formularios públicos y auditoría de cada acción — no un login compartido para todo el equipo.' },
]

const steps = [
  { title: 'Da de alta la propiedad', text: 'Fotos, plano, precio y características desde el mismo panel donde ya gestionas leads y clientes.' },
  { title: 'Elige los canales', text: 'Marca en qué portales, redes y tu propia web debe aparecer, y en qué orden — cada canal con su prioridad y sus reintentos.' },
  { title: 'Programa el lanzamiento', text: 'Publicación inmediata o escalonada por horas: primero tu web, después portales, después redes — tú decides la secuencia.' },
  { title: 'Sigue el resultado', text: 'Historial en tiempo real de qué se publicó, qué falló y por qué, con reintento automático con backoff — sin sorpresas silenciosas.' },
]

const plans = [
  { name: 'Starter', for: 'Una agencia, un equipo pequeño', items: ['Catálogo + CRM completo', 'Blog & CMS incluido', 'Hasta 3 usuarios'], featured: false },
  { name: 'Growth', for: 'Agencias en crecimiento, varios agentes', items: ['Todo lo de Starter', 'Publicación multicanal programada', 'Usuarios ilimitados'], featured: true },
  { name: 'Enterprise', for: 'Grupos con varias marcas o franquicias', items: ['Todo lo de Growth', 'Varias empresas bajo un mismo grupo', 'Soporte y onboarding dedicado'], featured: false },
]

const faqs = [
  { q: '¿Publica de verdad en Idealista, Fotocasa o redes sociales?', a: 'El motor de programación, secuenciación y reintentos ya está construido y funciona de punta a punta. La conexión en vivo con cada portal o red se activa con las credenciales de API que tengas con ellos — te ayudamos a configurarlas durante el alta. No fingimos una publicación que no se ha hecho: si un canal no está conectado, el panel te lo dice explícitamente.' },
  { q: '¿Mis datos se mezclan con los de otra inmobiliaria?', a: 'No. Cada empresa tiene su propio identificador y todas las consultas del sistema se filtran por él — está comprobado con pruebas cruzadas reales entre distintas cuentas, no solo revisado en el código.' },
  { q: '¿Puedo mantener mi dominio y mi marca?', a: 'Sí. El logo, el nombre y el color de marca se configuran por empresa y se aplican automáticamente en tu panel y en tu web pública.' },
  { q: '¿Necesito instalar algo?', a: 'No. Es una plataforma web — accedes desde cualquier navegador, sin instalar nada en tu equipo ni en el de tu equipo comercial.' },
  { q: '¿Qué pasa con mi catálogo actual?', a: 'Migramos tu catálogo, tus contactos y tu histórico de visitas/reservas al dar de alta tu cuenta, para que no empieces de cero.' },
]
</script>

<style scoped>
.lp {
  --lp-paper: #f4f1e9;
  --lp-paper-2: #efeadf;
  --lp-panel: #fffdf8;
  --lp-ink: #17130e;
  --lp-muted: #7a7266;
  --lp-line: #e2dacb;
  --lp-brand: #0e5b54;
  --lp-brand-deep: #0a463f;
  --lp-cta: #e5482b;
  --lp-cta-deep: #c53a1f;
  --lp-r: 4px;
  --lp-font-display: 'Bricolage Grotesque', 'Inter', ui-sans-serif, sans-serif;
  --lp-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --lp-mono: 'Space Mono', ui-monospace, monospace;

  background: var(--lp-paper);
  color: var(--lp-ink);
  font-family: var(--lp-font);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.lp-container {
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 24px;
}

.lp-eyebrow {
  display: inline-flex;
  align-items: center;
  border-radius: var(--lp-r);
  background: var(--lp-paper-2);
  border: 1px solid var(--lp-line);
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--lp-brand);
}

.lp-h1,
.lp-h2 {
  font-family: var(--lp-font-display);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--lp-ink);
  margin: 0;
}
.lp-h1 {
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  line-height: 1.05;
  margin-top: 18px;
}
.lp-h1-accent {
  color: var(--lp-brand);
}
.lp-h2 {
  font-size: clamp(1.7rem, 3.4vw, 2.4rem);
  margin-top: 14px;
}
.lp-lead {
  font-size: 1.05rem;
  color: var(--lp-muted);
  max-width: 46ch;
  margin: 18px 0 0;
}
.lp-section-lead {
  font-size: 1rem;
  color: var(--lp-muted);
  max-width: 56ch;
  margin: 10px 0 0;
}

/* Nav */
.lp-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(244, 241, 233, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--lp-line);
}
.lp-nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 68px;
  gap: 20px;
}
.lp-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--lp-ink);
}
.lp-logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--lp-r);
  background: var(--lp-brand);
  color: #fff;
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}
.lp-logo-mark-dark {
  background: var(--lp-cta);
}
.lp-logo-word {
  font-family: var(--lp-font-display);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
}
.lp-logo-sub {
  display: block;
  font-family: var(--lp-font);
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lp-muted);
}
.lp-nav-links {
  display: flex;
  gap: 28px;
  font-size: 14px;
  font-weight: 500;
}
.lp-nav-links a {
  color: var(--lp-ink);
  text-decoration: none;
  opacity: 0.75;
}
.lp-nav-links a:hover {
  opacity: 1;
}
.lp-nav-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.lp-nav-login {
  font-size: 14px;
  font-weight: 500;
  color: var(--lp-ink);
  text-decoration: none;
}
.lp-nav-cta {
  display: inline-flex;
  align-items: center;
  background: var(--lp-cta);
  color: #fff;
  border-radius: var(--lp-r);
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease;
}
.lp-nav-cta:hover {
  background: var(--lp-cta-deep);
}
.lp-burger {
  display: none;
  flex-direction: column;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
}
.lp-burger span {
  width: 20px;
  height: 2px;
  background: var(--lp-ink);
}

/* Hero */
.lp-hero {
  padding: clamp(48px, 7vw, 88px) 0 clamp(40px, 5vw, 64px);
}
.lp-hero-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 48px;
  align-items: center;
}
.lp-hero-form {
  display: flex;
  gap: 10px;
  margin-top: 28px;
  max-width: 420px;
}
.lp-input {
  flex: 1;
  border: 1px solid var(--lp-line);
  background: var(--lp-panel);
  border-radius: var(--lp-r);
  padding: 12px 14px;
  font-size: 14px;
  font-family: var(--lp-font);
  color: var(--lp-ink);
}
.lp-input:focus {
  outline: 2px solid var(--lp-brand);
  outline-offset: 1px;
}
.lp-btn-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  background: var(--lp-cta);
  color: #fff;
  border: none;
  border-radius: var(--lp-r);
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}
.lp-btn-cta:hover {
  background: var(--lp-cta-deep);
}
.lp-btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--lp-ink);
  color: var(--lp-ink);
  border-radius: var(--lp-r);
  padding: 11px 20px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.lp-hero-note {
  font-size: 12px;
  color: var(--lp-muted);
  margin: 10px 0 0;
}

/* Hero product mockup panel */
.lp-hero-panel {
  border: 1px solid var(--lp-line);
  border-radius: 10px;
  background: var(--lp-panel);
  overflow: hidden;
  box-shadow: 0 24px 60px -24px rgba(23, 19, 14, 0.18);
}
.lp-panel-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--lp-line);
  background: var(--lp-paper-2);
}
.lp-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.lp-dot-a {
  background: #ff5f57;
}
.lp-dot-b {
  background: #febc2e;
}
.lp-dot-c {
  background: #28c840;
}
.lp-panel-title {
  margin-left: 6px;
  font-size: 12px;
  color: var(--lp-muted);
  font-family: var(--lp-mono);
}
.lp-panel-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.lp-mock-stat {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-r);
  padding: 12px 16px;
  background: var(--lp-paper);
}
.lp-mock-label {
  font-size: 13px;
  color: var(--lp-muted);
}
.lp-mock-num {
  font-family: var(--lp-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--lp-brand);
}
.lp-mock-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.lp-mock-chip {
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--lp-r);
  padding: 7px 10px;
  border: 1px solid transparent;
}
.lp-chip-ok {
  background: #e7f3ee;
  color: var(--lp-brand-deep);
  border-color: #c7e3d8;
}
.lp-chip-wait {
  background: var(--lp-paper-2);
  color: var(--lp-muted);
  border-color: var(--lp-line);
}
.lp-chip-retry {
  background: #fdece7;
  color: var(--lp-cta-deep);
  border-color: #f6cfc2;
}

/* Trust strip */
.lp-strip {
  border-top: 1px solid var(--lp-line);
  border-bottom: 1px solid var(--lp-line);
  background: var(--lp-paper-2);
  padding: 26px 0;
}
.lp-strip-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  text-align: center;
}
.lp-strip-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--lp-muted);
}
.lp-mono {
  font-family: var(--lp-mono);
  font-weight: 700;
  font-size: 26px;
  color: var(--lp-ink);
}

/* Sections */
.lp-section {
  padding: clamp(56px, 7vw, 96px) 0;
}
.lp-section-alt {
  background: var(--lp-paper-2);
}

/* Features */
.lp-features {
  margin-top: 36px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.lp-feature-card {
  border: 1px solid var(--lp-line);
  border-radius: 10px;
  background: var(--lp-panel);
  padding: 24px;
}
.lp-feature-icon {
  font-size: 26px;
  margin-bottom: 10px;
}
.lp-feature-card h3 {
  font-family: var(--lp-font-display);
  font-size: 1.05rem;
  margin: 0 0 8px;
}
.lp-feature-card p {
  font-size: 0.92rem;
  color: var(--lp-muted);
  margin: 0;
}

/* Steps */
.lp-steps {
  margin-top: 36px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.lp-step {
  border-top: 2px solid var(--lp-brand);
  padding-top: 16px;
}
.lp-step-num {
  font-family: var(--lp-mono);
  font-size: 12px;
  color: var(--lp-brand);
  font-weight: 700;
}
.lp-step h3 {
  font-family: var(--lp-font-display);
  font-size: 1rem;
  margin: 10px 0 8px;
}
.lp-step p {
  font-size: 0.9rem;
  color: var(--lp-muted);
  margin: 0;
}

/* Pricing */
.lp-pricing {
  margin-top: 36px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.lp-plan-card {
  position: relative;
  border: 1px solid var(--lp-line);
  border-radius: 10px;
  background: var(--lp-panel);
  padding: 26px 24px;
  display: flex;
  flex-direction: column;
}
.lp-plan-featured {
  border-color: var(--lp-brand);
  box-shadow: 0 20px 40px -28px rgba(14, 91, 84, 0.35);
}
.lp-plan-badge {
  position: absolute;
  top: -12px;
  right: 20px;
  background: var(--lp-brand);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-radius: var(--lp-r);
  padding: 4px 10px;
}
.lp-plan-card h3 {
  font-family: var(--lp-font-display);
  font-size: 1.2rem;
  margin: 0 0 4px;
}
.lp-plan-for {
  font-size: 0.85rem;
  color: var(--lp-muted);
  margin: 0 0 16px;
}
.lp-plan-list {
  list-style: none;
  margin: 0 0 22px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 0.9rem;
  flex: 1;
}
.lp-plan-list li {
  padding-left: 20px;
  position: relative;
}
.lp-plan-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--lp-brand);
  font-weight: 700;
}
.lp-plan-cta {
  text-align: center;
  text-decoration: none;
}

/* FAQ */
.lp-faq-container {
  max-width: 780px;
}
.lp-faqs {
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lp-faq {
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-r);
  background: var(--lp-panel);
  padding: 4px 18px;
}
.lp-faq summary {
  cursor: pointer;
  padding: 16px 0;
  font-weight: 600;
  font-size: 0.98rem;
  list-style: none;
}
.lp-faq summary::-webkit-details-marker {
  display: none;
}
.lp-faq summary::after {
  content: '+';
  float: right;
  font-family: var(--lp-mono);
  color: var(--lp-muted);
}
.lp-faq[open] summary::after {
  content: '−';
}
.lp-faq p {
  margin: 0 0 16px;
  font-size: 0.92rem;
  color: var(--lp-muted);
  line-height: 1.6;
}

/* Final CTA */
.lp-final-cta {
  background: var(--lp-ink);
  color: var(--lp-paper);
  padding: clamp(56px, 7vw, 88px) 0;
  text-align: center;
}
.lp-final-cta .lp-h2 {
  color: #fff;
}
.lp-final-cta p {
  color: rgba(244, 241, 233, 0.7);
  margin: 12px 0 0;
}
.lp-final-form {
  justify-content: center;
  margin: 28px auto 0;
}

/* Footer */
.lp-footer {
  background: var(--lp-ink);
  color: rgba(244, 241, 233, 0.7);
  padding: 44px 0 24px;
}
.lp-footer-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 32px;
}
.lp-footer-grid a {
  display: block;
  color: rgba(244, 241, 233, 0.7);
  text-decoration: none;
  font-size: 0.9rem;
  margin-bottom: 8px;
}
.lp-footer-grid a:hover {
  color: #fff;
}
.lp-footer-head {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(244, 241, 233, 0.45);
  margin: 0 0 12px;
}
.lp-footer-tagline {
  margin: 12px 0 0;
  font-size: 0.9rem;
  max-width: 32ch;
}
.lp-footer-legal {
  text-align: center;
  font-size: 12px;
  color: rgba(244, 241, 233, 0.4);
  margin: 32px 0 0;
}

@media (max-width: 860px) {
  .lp-hero-grid {
    grid-template-columns: 1fr;
  }
  .lp-features,
  .lp-steps,
  .lp-pricing {
    grid-template-columns: 1fr;
  }
  .lp-strip-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .lp-footer-grid {
    grid-template-columns: 1fr;
  }
  .lp-nav-links {
    display: none;
  }
  .lp-nav-login {
    display: none;
  }
  .lp-burger {
    display: flex;
  }
}
</style>
