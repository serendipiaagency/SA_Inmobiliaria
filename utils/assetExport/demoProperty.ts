/**
 * Propiedad FICTICIA de demostración para previsualizar plantillas (miniaturas
 * del apartado «Plantillas» y lienzo del editor cuando no hay una propiedad
 * real vinculada). Tiene la MISMA forma que la respuesta de
 * `/api/admin/asset-export/preview-bindings` (`{ values, images }`) y que
 * `resolveAssetBindings` del servidor, así que los mismos resolvedores de
 * cliente (utils/assetExport/clientRender.ts) sirven para datos reales y para
 * estos de ejemplo.
 *
 * SEPARACIÓN DEMO / PRODUCCIÓN (requisito del propietario): estos datos SÓLO se
 * usan para pintar la previsualización en el cliente. NO se crean como propiedad
 * en Property Core, no entran en catálogos, no se publican, no cuentan en
 * estadísticas, no generan leads ni aparecen en búsquedas, y NUNCA sustituyen
 * datos reales en una exportación: el documento real lo genera el servidor con
 * `resolveAssetBindings` y el id de la propiedad elegida. Las estructuras de
 * plantilla guardan sólo tokens de binding (`{{asset.title}}`…), nunca estos
 * valores resueltos, de modo que no pueden filtrarse a producción.
 *
 * Las imágenes son ficheros estáticos de `public/demo-assets/…`, cargables
 * directamente por el navegador (no claves de R2), ya presentes en el repo.
 */
export interface AssetBindings {
  values: Record<string, string>
  images: Record<string, string | null>
}

const IMG = '/demo-assets/norte-astur'

export const DEMO_BINDINGS: AssetBindings = {
  values: {
    // Propiedad (ficticia, coherente con la marca de demostración «Norte Astur»)
    'asset.title': 'Villa moderna con vistas al mar',
    'asset.reference': 'DEMO-104',
    'asset.price': '485.000 €',
    'asset.pricePerSquareMeter': '2.622 €/m²',
    'asset.location': 'Primera línea de costa, Candás (Asturias)',
    'asset.city': 'Candás',
    'asset.propertyType': 'Chalet',
    'asset.bedrooms': '4',
    'asset.bathrooms': '3',
    'asset.builtArea': '185 m²',
    'asset.description':
      'Vivienda luminosa y de líneas contemporáneas, con amplios espacios, jardín privado y excelentes acabados. A pocos minutos de la playa y de todos los servicios.',
    'asset.publicUrl': 'https://demo.portalinmo.com/propiedades/villa-moderna-vistas-al-mar',
    'asset.qrCode': 'https://demo.portalinmo.com/propiedades/villa-moderna-vistas-al-mar',
    // Inmobiliaria (marca de demostración)
    'tenant.website': 'www.norteastur-demo.com',
    'tenant.legalText': 'Documento de demostración · datos ficticios, no contractuales.',
    'tenant.phone': '+34 985 00 00 00',
    'tenant.whatsapp': '+34 600 00 00 00',
    'tenant.email': 'hola@norteastur-demo.com',
    // Brand Kit de demostración (mismos roles que resuelve el render real).
    'tenant.primaryColor': '#16150f',
    'tenant.secondaryColor': '#66593a',
    'tenant.backgroundColor': '#ffffff',
    'tenant.textColor': '#16150f',
    'tenant.accentColor': '#b08d57',
    'tenant.fontHeading': 'Georgia',
    'tenant.fontBody': 'Helvetica',
  },
  images: {
    'asset.mainImage': `${IMG}/propiedades/p10-01.jpg`,
    'asset.masterPlanImage': `${IMG}/planos/p10-planta-baja.png`,
    'asset.locationMapImage': `${IMG}/asturias/costa-01.jpg`,
    'tenant.logo': `${IMG}/marca/marca-norte-astur.png`,
  },
}
