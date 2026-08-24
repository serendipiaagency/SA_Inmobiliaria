export type EmailLocale = 'es' | 'en'

export interface EmailOrgBranding {
  companyName: string
  logo?: string | null
  brandColor?: string | null
}

const FOOTER_TEXT: Record<EmailLocale, { transactional: string; commercial: (unsubscribeUrl: string) => string }> = {
  es: {
    transactional: 'Este es un mensaje transaccional relacionado con tu actividad en la plataforma.',
    commercial: (url) => `Recibes esto porque te suscribiste a esta alerta. <a href="${url}" style="color:#6b7280">Cancelar suscripción</a>.`,
  },
  en: {
    transactional: 'This is a transactional message related to your activity on the platform.',
    commercial: (url) => `You're receiving this because you subscribed to this alert. <a href="${url}" style="color:#6b7280">Unsubscribe</a>.`,
  },
}

/**
 * A single responsive HTML shell every template renders its content into —
 * table-based layout + inline styles (the only markup real-world email
 * clients render consistently), org branding in the header, and a footer
 * that structurally enforces the transactional/commercial distinction: a
 * commercial email always gets an unsubscribe link, a transactional one
 * never does (nothing to opt out of your own appointment confirmation).
 */
export function renderEmailLayout(opts: {
  branding: EmailOrgBranding
  locale: EmailLocale
  title: string
  bodyHtml: string
  kind: 'transactional' | 'commercial'
  unsubscribeUrl?: string | null
}): string {
  const accent = opts.branding.brandColor || '#111827'
  const footer =
    opts.kind === 'commercial' && opts.unsubscribeUrl
      ? FOOTER_TEXT[opts.locale].commercial(opts.unsubscribeUrl)
      : FOOTER_TEXT[opts.locale].transactional

  return `<!doctype html>
<html lang="${opts.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:3px solid ${escapeAttr(accent)};">
${opts.branding.logo ? `<img src="${escapeAttr(opts.branding.logo)}" alt="${escapeAttr(opts.branding.companyName)}" style="max-height:36px;display:block;">` : `<span style="font-size:18px;font-weight:700;color:${escapeAttr(accent)};">${escapeHtml(opts.branding.companyName)}</span>`}
</td></tr>
<tr><td style="padding:32px;color:#18181b;font-size:15px;line-height:1.6;">
${opts.bodyHtml}
</td></tr>
<tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;line-height:1.5;">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

/** Reusable inner-content building blocks so each template stays a few lines, not a bespoke document. */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#18181b;">${escapeHtml(text)}</h1>`
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 16px;">${text}</p>`
}

export function emailButton(label: string, url: string, accent?: string | null): string {
  const color = accent || '#111827'
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:8px;background:${escapeAttr(color)};"><a href="${escapeAttr(url)}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`
}

export function emailInfoTable(rows: Array<[string, string]>): string {
  const trs = rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 0;font-size:13px;font-weight:500;">${escapeHtml(v)}</td></tr>`)
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">${trs}</table>`
}

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}
