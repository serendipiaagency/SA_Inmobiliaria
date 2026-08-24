/**
 * The common contract every channel adapter implements — real or stubbed.
 * `not_configured`/`not_implemented` are always terminal and non-retryable:
 * the dispatcher (server/utils/publication/dispatcher.ts) checks `retryable`
 * before spending any of a job's retry budget on them.
 */
export type PublishState = 'not_configured' | 'not_implemented' | 'connected' | 'publishing' | 'published' | 'failed' | 'unpublished'

export interface PublishContext {
  channelKey: string
  action: 'publish' | 'update_images' | 'update_text' | 'unpublish'
  property: { id: number; slug: string | null; name: string }
  externalId?: string | null
  /** Stable per-attempt key (job id + retry count) a real adapter should forward to the provider so a retried call never double-publishes. */
  idempotencyKey: string
  env: Record<string, any>
  /** Decrypted per-organization credential, if the org configured its own (see credentials.ts). Falls back to `env[secretEnvVar]` when absent. */
  credential?: string | null
}

export interface PublishResult {
  state: PublishState
  /** True only for an outcome that reflects a real, successful provider response (published/unpublished/connected). */
  ok: boolean
  /** False for not_configured/not_implemented — there is nothing a retry could fix. */
  retryable: boolean
  message: string
  externalId?: string | null
  externalUrl?: string | null
  /** Sanitized (no secrets/tokens) summary of the provider's response, safe to store and display. */
  responseSummary?: string | null
}

export interface ChannelAdapter {
  validateCredentials(env: Record<string, any>, credential?: string | null): Promise<{ ok: boolean; message: string }>
  publish(ctx: PublishContext): Promise<PublishResult>
  updateText(ctx: PublishContext): Promise<PublishResult>
  updateImages(ctx: PublishContext): Promise<PublishResult>
  unpublish(ctx: PublishContext): Promise<PublishResult>
  getStatus(ctx: PublishContext): Promise<PublishResult>
}
