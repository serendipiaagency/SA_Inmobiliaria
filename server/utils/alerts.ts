/**
 * Aviso de operación por webhook (Slack/Discord), el mismo canal que usa
 * server/plugins/error-logging.ts para los errores de servidor.
 *
 * Extraído a un sitio propio para que otras cosas que merecen un aviso —un
 * dominio de cliente que deja de responder, por ejemplo— usen exactamente
 * el mismo secreto y el mismo formato, en vez de cada una inventarse el
 * suyo. Slack y Discord aceptan ambos un cuerpo JSON con `text` /
 * `content` en su URL de incoming webhook; se mandan los dos para no tener
 * que saber cuál está configurado.
 *
 * Devuelve `false` cuando no hay URL configurada o el envío falla. Nunca
 * lanza: un aviso que no sale no puede ser lo que rompa la tarea o la
 * petición que lo estaba dando.
 */
export async function postOpsAlert(env: Record<string, any> | undefined, text: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const webhookUrl = env?.ERROR_ALERT_WEBHOOK_URL
  if (!webhookUrl) return false
  const body = text.slice(0, 1900)
  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: body, content: body }),
    })
    return res.ok
  } catch (err) {
    console.error('Failed to post ops alert webhook', err)
    return false
  }
}
