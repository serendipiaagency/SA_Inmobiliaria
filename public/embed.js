/**
 * SA Inmobiliaria — embeddable widget loader.
 *
 * Usage: drop a script tag with data-* attributes anywhere on your page.
 *   <script src="https://SITE/embed.js"
 *           data-widget="grid" data-filter="featured" data-city=""
 *           data-limit="6" data-theme="light" data-accent="#16150f"
 *           data-font="sans" data-cols="3" data-radius="16" data-currency="AED"></script>
 *
 * The script inserts a responsive, sandboxed iframe right after itself and
 * auto-resizes it to its content height via postMessage.
 */
(function () {
  var script = document.currentScript
  if (!script) return
  var origin = new URL(script.src, location.href).origin

  var d = script.dataset || {}
  var params = new URLSearchParams()
  var keys = ['widget', 'filter', 'city', 'limit', 'theme', 'accent', 'font', 'cols', 'radius', 'currency', 'header', 'branding']
  keys.forEach(function (k) {
    if (d[k] != null && d[k] !== '') params.set(k, d[k])
  })
  var id = 'sa' + Math.random().toString(36).slice(2, 9)
  params.set('id', id)

  var iframe = document.createElement('iframe')
  iframe.src = origin + '/embed?' + params.toString()
  iframe.setAttribute('title', 'SA Inmobiliaria')
  iframe.setAttribute('loading', 'lazy')
  iframe.setAttribute('scrolling', 'no')
  iframe.style.cssText = 'width:100%;border:0;overflow:hidden;display:block;'
  iframe.style.height = (d.height || '520') + 'px'
  iframe.dataset.saId = id

  script.parentNode.insertBefore(iframe, script.nextSibling)

  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return
    var data = e.data || {}
    if (data.type === 'sa-embed-height' && data.id === id && data.height) {
      iframe.style.height = data.height + 'px'
    }
  })
})()
