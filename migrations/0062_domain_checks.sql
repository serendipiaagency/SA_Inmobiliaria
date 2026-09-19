-- Migration number: 0062    Historial de comprobaciones de dominios personalizados
--
-- Un dominio de cliente que deja de enrutar a su agencia (DNS cambiado, el
-- Custom Domain retirado en Cloudflare, la fila `organizations.domain`
-- editada por error) no lo detectaba nadie hasta que un administrador no
-- podía entrar. server/tasks/system/check-custom-domains.ts comprueba cada
-- dominio configurado cada 10 minutos y guarda aquí el resultado; el aviso
-- (webhook de incidencias + email) sólo sale cuando el estado CAMBIA, y para
-- saber si ha cambiado hace falta el resultado anterior — por eso es una
-- tabla y no dos columnas en organizations.
--
-- Aditiva: tabla nueva, ningún cambio en tablas existentes. Sin
-- organization_id NOT NULL + FK porque un dominio puede seguir
-- comprobándose durante los minutos que tarda en borrarse una agencia;
-- el índice por organización es lo que consulta Estado del sistema.

CREATE TABLE domain_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX domain_checks_org_checked ON domain_checks (organization_id, checked_at);
