#!/usr/bin/env node
/**
 * Genera el catálogo geográfico de España del buscador (public/geo/es.json) a
 * partir de los volcados de GeoNames (CC-BY 4.0, https://www.geonames.org/):
 *
 *   node scripts/geo/build-es.mjs <carpeta>
 *
 * La carpeta tiene que contener, ya descomprimidos:
 *   - ES.txt                 (https://download.geonames.org/export/dump/ES.zip)
 *   - ES-postal.txt          (https://download.geonames.org/export/zip/ES.zip, su ES.txt renombrado)
 *
 * Qué sale: comunidades autónomas (ADM1), provincias (ADM2, con su código INE
 * de dos cifras deducido de sus municipios), municipios (ADM3, código INE de
 * cinco cifras, coordenadas, población y variantes del nombre en otras lenguas
 * oficiales), localidades y barrios (PPL*, con su municipio) y códigos
 * postales (con sus municipios y coordenadas). Nada inventado: cada fila es
 * una entidad real de GeoNames; el buscador sólo las ordena y las enseña.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = process.argv[2]
if (!dir) {
  console.error('Uso: node scripts/geo/build-es.mjs <carpeta con ES.txt y ES-postal.txt>')
  process.exit(1)
}
const here = dirname(fileURLToPath(import.meta.url))
// Fichero estático de la web (binding ASSETS del Worker), fuera del bundle del script: ver server/utils/geo/catalog.ts.
const out = join(here, '..', '..', 'public', 'geo', 'es.json')

const tsv = (file) => readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
const num = (v, d = 4) => Math.round(Number(v) * 10 ** d) / 10 ** d

/** Nombre sin tildes ni mayúsculas, para comparar (igual que normalizeText en utils/searchState.ts). */
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ\s-]/g, ' ').replace(/\s+/g, ' ').trim()

const rows = tsv('ES.txt')
// Columnas de GeoNames: 0 id, 1 name, 2 asciiname, 3 alternatenames, 4 lat, 5 lng, 6 fclass, 7 fcode, 8 cc, 9 cc2, 10 admin1, 11 admin2, 12 admin3, 13 admin4, 14 population
const regions = []
const provinces = []
const municipalities = []
const localities = []
const provinceIne = new Map() // letra de GeoNames → código INE (2 cifras), por los municipios
const municipalityNames = new Map() // ine → nombres normalizados (oficial y cooficiales), para no repetir la capital como localidad

/**
 * Variantes del nombre: las denominaciones cooficiales que GeoNames escribe en
 * el propio nombre separadas por «/» («Gijón/Xixón», «Alicante/Alacant»). Los
 * «alternatenames» del volcado no traen idioma y mezclan exónimos de cualquier
 * lengua, así que no se usan: nada que no sea oficial.
 */
function variants(r) {
  const parts = r[1].split('/').map((x) => x.trim()).filter(Boolean)
  return parts.length > 1 ? parts : []
}

/** Nombres oficiales de las comunidades autónomas (con la denominación cooficial tras «/»), por el código admin1 de GeoNames. */
const REGION_NAMES = {
  '07': 'Illes Balears', '27': 'La Rioja', '29': 'Comunidad de Madrid', '31': 'Región de Murcia', '32': 'Comunidad Foral de Navarra/Nafarroako Foru Komunitatea',
  '34': 'Principado de Asturias', '39': 'Cantabria', '51': 'Andalucía', '52': 'Aragón', '53': 'Canarias', '54': 'Castilla-La Mancha', '55': 'Castilla y León',
  '56': 'Cataluña/Catalunya', '57': 'Extremadura', '58': 'Galicia', '59': 'País Vasco/Euskadi', '60': 'Comunidad Valenciana/Comunitat Valenciana', CE: 'Ceuta', ML: 'Melilla',
}

/** Nombres oficiales de las provincias (INE), que GeoNames trae en inglés o con «Provincia de». */
const PROVINCE_NAMES = {
  '01': 'Araba/Álava', '02': 'Albacete', '03': 'Alicante/Alacant', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz', '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
  '11': 'Cádiz', '12': 'Castellón/Castelló', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
  '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia/València', '47': 'Valladolid', '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza',
  '51': 'Ceuta', '52': 'Melilla',
}

for (const r of rows) {
  const code = r[7]
  if (code === 'ADM1') {
    const name = REGION_NAMES[r[10]] || r[1]
    regions.push({ id: r[10], name, lat: num(r[4]), lng: num(r[5]), pop: Number(r[14]) || 0, alt: variants({ 1: name }) })
  }
  else if (code === 'ADM2') provinces.push({ id: r[11], region: r[10], name: r[1], lat: num(r[4]), lng: num(r[5]), pop: Number(r[14]) || 0, alt: variants(r) })
  else if (code === 'ADM3' && /^\d{5}$/.test(r[12])) {
    municipalities.push({ ine: r[12], province: r[11], name: r[1], lat: num(r[4]), lng: num(r[5]), pop: Number(r[14]) || 0, alt: variants(r) })
    municipalityNames.set(r[12], new Set([norm(r[1]), ...variants(r).map(norm)]))
    const ine2 = r[12].slice(0, 2)
    const bag = provinceIne.get(r[11]) ?? new Map()
    bag.set(ine2, (bag.get(ine2) ?? 0) + 1)
    provinceIne.set(r[11], bag)
  }
}
for (const r of rows) {
  if (!/^PPL/.test(r[7]) || !/^\d{5}$/.test(r[12])) continue
  if (!municipalityNames.has(r[12])) continue
  if (municipalityNames.get(r[12]).has(norm(r[1]))) continue // la capital con el nombre del municipio (o su cooficial) ya es el municipio
  localities.push({ id: Number(r[0]), name: r[1], ine: r[12], kind: r[7], lat: num(r[4]), lng: num(r[5]), pop: Number(r[14]) || 0 })
}
for (const p of provinces) {
  const bag = provinceIne.get(p.id)
  p.ine = bag ? [...bag].sort((a, b) => b[1] - a[1])[0][0] : null
  if (p.ine && PROVINCE_NAMES[p.ine]) {
    p.name = PROVINCE_NAMES[p.ine]
    p.alt = variants({ 1: p.name })
  }
}

// Códigos postales: 0 cc, 1 cp, 2 localidad, 3 ccaa, 4 ccaa code, 5 provincia, 6 prov code, 7 municipio, 8 ine, 9 lat, 10 lng
const postal = new Map()
for (const r of tsv('ES-postal.txt')) {
  const cp = r[1]
  if (!/^\d{5}$/.test(cp)) continue
  const e = postal.get(cp) ?? { cp, ine: [], lat: num(r[9]), lng: num(r[10]) }
  if (/^\d{5}$/.test(r[8]) && !e.ine.includes(r[8]) && municipalityNames.has(r[8])) e.ine.push(r[8])
  postal.set(cp, e)
}

const catalog = {
  source: 'GeoNames (https://www.geonames.org/), licencia CC-BY 4.0',
  generatedAt: new Date().toISOString().slice(0, 10),
  // Arrays compactos: [id, nombre, lat, lng, población, variantes]
  regions: regions.map((r) => [r.id, r.name, r.lat, r.lng, r.pop, r.alt]),
  // [letra GeoNames, código INE (2), región, nombre, lat, lng, población, variantes]
  provinces: provinces.map((p) => [p.id, p.ine, p.region, p.name, p.lat, p.lng, p.pop, p.alt]),
  // [INE (5), letra de provincia, nombre, lat, lng, población, variantes]
  municipalities: municipalities.map((m) => [m.ine, m.province, m.name, m.lat, m.lng, m.pop, m.alt]),
  // [id GeoNames, nombre, INE del municipio, tipo (PPL, PPLX, PPLA…), lat, lng, población]
  localities: localities.map((l) => [l.id, l.name, l.ine, l.kind, l.lat, l.lng, l.pop]),
  // [CP, [INE…], lat, lng]
  postalCodes: [...postal.values()].sort((a, b) => a.cp.localeCompare(b.cp)).map((e) => [e.cp, e.ine, e.lat, e.lng]),
}
mkdirSync(dirname(out), { recursive: true })
const json = JSON.stringify(catalog)
writeFileSync(out, json)
console.log(`regiones ${regions.length} · provincias ${provinces.length} (sin INE: ${provinces.filter((p) => !p.ine).length}) · municipios ${municipalities.length} · localidades ${localities.length} · CP ${postal.size}`)
console.log(`public/geo/es.json: ${(json.length / 1048576).toFixed(2)} MB (gzip ${(gzipSync(json).length / 1024).toFixed(0)} KB)`)
