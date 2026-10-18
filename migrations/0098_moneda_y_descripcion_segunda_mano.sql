-- Migration number: 0098    Moneda de cada propiedad y descripción de las de 2ª mano
--
-- SOLO AÑADE columnas. Ninguna fila existente se reescribe ni se borra: las
-- tres columnas nuevas quedan en NULL, que significa exactamente lo que se
-- hace hoy: «sin moneda propia» (se usa la moneda de la inmobiliaria) y «sin
-- descripción en castellano». Se despliega ANTES que el código que las lee
-- (lección del 2026-09-15: el código nunca debe ejecutarse contra un esquema
-- que todavía no tiene la columna).
--
-- Para qué (reestructuración del Constructor de Propiedades, Cola 11):
--   - developer_properties.currency / agent_properties.currency: el código
--     ISO 4217 de la moneda del precio de la propiedad («EUR», «USD», «GBP»…).
--     NULL = la moneda de la inmobiliaria. Es el código, no un símbolo: el
--     símbolo, el formato y los decimales salen de él. No se convierten
--     importes entre monedas.
--   - agent_properties.description: la descripción de una propiedad de 2ª
--     mano. Hasta ahora sólo tenía título y descripción por idioma en
--     property_translations (en y ar): no había descripción en castellano y
--     el constructor de propiedades de las dos secciones no podía ser el
--     mismo. Las traducciones no se tocan.
--
-- Recuperación: son columnas nullables sin default; volver atrás es no
-- leerlas (el código anterior las ignora) y, si hiciera falta quitarlas, una
-- migración de CONTRACT aparte cuando nada las lea.
--
-- developer_properties pasa de 95 a 96 columnas (D1 admite 100) y
-- agent_properties de 80 a 82.

ALTER TABLE developer_properties ADD COLUMN currency TEXT;
ALTER TABLE agent_properties ADD COLUMN currency TEXT;
ALTER TABLE agent_properties ADD COLUMN description TEXT;
