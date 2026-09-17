import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // El registro del Constructor Web (composables/useSiteBuilderRegistry.ts)
  // importa sus inspectores como `.vue` y con el alias `~` de Nuxt, así que
  // una prueba que quiera comprobar que el catálogo está completo necesita
  // resolver las dos cosas. Sólo se compila lo que una prueba importa de
  // verdad: nada de esto toca a las que no lo hacen.
  //
  // Importar un componente no es montarlo: los auto-imports de Nuxt (`ref`,
  // `computed`) siguen sin existir aquí, y por eso las pruebas de este
  // proyecto comprueban datos y estructura, no render de componentes.
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('.', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // Playwright owns tests/e2e/**/*.spec.ts — keep it out of Vitest's default
    // *.spec.ts glob so `npm test` doesn't try to run it as a unit test.
    include: ['test/unit/**/*.test.ts'],
  },
})
