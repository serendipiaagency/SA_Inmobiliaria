-- Migration number: 0085    Empresas — origen del alta y dimensiones de acceso separadas
--
-- Hasta ahora una organización sólo tenía `status` (active | suspended), y
-- ni siquiera se aplicaba al iniciar sesión. Con el autorregistro público
-- (Landing → Registro Empresa) y la futura aprobación o pago, hacen falta
-- dimensiones separadas en vez de un único estado que lo mezcle todo:
--
--   status              → estado operativo que decide el super admin (ya existía)
--   registration_source → cómo se dio de alta: 'admin' (Sistemas > Empresas >
--                          + Nuevo) o 'self_service' (registro web)
--   approval_status     → 'approved' | 'pending' | 'rejected' — aprobación del
--                          super admin (hoy todas quedan 'approved')
--   billing_status      → 'not_required' | 'pending' | 'active' | 'past_due' —
--                          pago/suscripción (hoy no hay billing: 'not_required')
--
-- La decisión de acceso combina las cuatro en un solo sitio
-- (server/utils/organizations/access.ts).
--
-- Esta migración SÓLO AÑADE columnas con valores por defecto: cada
-- organización existente queda exactamente como estaba ('admin', 'approved',
-- 'not_required'). Ninguna fila se reescribe ni se borra.
-- Se despliega ANTES que el código que lee estas columnas.

ALTER TABLE organizations ADD COLUMN registration_source TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE organizations ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE organizations ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'not_required';
