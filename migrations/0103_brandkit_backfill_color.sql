-- Migration number: 0103    Brand Kit: backfill del color principal desde organizations.brand_color
--
-- Migración de DATOS. Unifica la identidad de marca (Cola 22). Hasta ahora la
-- web pública y los emails usaban `organizations.brand_color` (un único color),
-- mientras que el Brand Kit (`brand_kits`, 4 colores + 3 tipografías) sólo lo
-- consumían los carteles. A partir de Cola 22 el Brand Kit pasa a ser la fuente
-- ÚNICA de identidad para web, emails y carteles; por eso copiamos el color
-- actual de cada agencia a `brand_kits.color_primary` cuando aún no lo tenga,
-- para que ninguna web ni email cambie de color al empezar a leer del Brand Kit.
--
-- SÓLO escribe datos: no crea ni altera tablas ni columnas, no borra nada. Es
-- idempotente (sólo rellena donde falta) y reversible por redepliegue. Va SOLA
-- y antes del código que convierte al Brand Kit en fuente única (Cola 22·web/
-- emails), de modo que ese código ya encuentre el color donde va a leerlo.

-- 1) Agencias que ya tienen Brand Kit pero sin color principal: se lo ponemos
--    con su color actual de marca.
UPDATE brand_kits
SET color_primary = (SELECT o.brand_color FROM organizations o WHERE o.id = brand_kits.organization_id)
WHERE (color_primary IS NULL OR color_primary = '')
  AND EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = brand_kits.organization_id AND o.brand_color IS NOT NULL AND o.brand_color <> ''
  );

-- 2) Agencias con color de marca pero sin fila de Brand Kit: creamos la fila
--    mínima con ese color (los demás campos quedan por defecto / nulos).
INSERT INTO brand_kits (organization_id, color_primary, created_at, updated_at)
SELECT o.id, o.brand_color, '2026-10-21 00:00:00', '2026-10-21 00:00:00'
FROM organizations o
WHERE o.brand_color IS NOT NULL AND o.brand_color <> ''
  AND NOT EXISTS (SELECT 1 FROM brand_kits b WHERE b.organization_id = o.id);
