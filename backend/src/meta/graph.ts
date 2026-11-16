/**
 * Meta Graph API client for the WhatsApp Cloud API.
 *
 * Request and response shapes were checked against Meta's documentation in November 2026;
 * see docs/plan/04-whatsapp-integration.md for the links. Every call takes the access token
 * of the company's WhatsApp account (or the platform token for app-level calls).
 */
import { AppError } from '../common/errors';
import { env } from '../config';

export interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_data?: { details?: string }; fbtrace_id?: string };
}

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: number | null,
    public readonly details: string | null
  ) {
    super(message);
  }
  /** Retrying will not help (bad request, no permission, policy). */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429 && this.code !== 4 && this.code !== 80007 && this.code !== 130429;
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof GraphError) {
    if (err.code === 138006) return new AppError('CALL_PERMISSION_MISSING', 'This customer has not allowed calls yet.');
    if (err.code === 131047) return new AppError('WINDOW_CLOSED', 'More than 24 hours since the customer’s last message. Send an approved template.');
    return new AppError('META_ERROR', `WhatsApp: ${err.details || err.message}`);
  }
  return new AppError('META_ERROR', 'Could not reach WhatsApp. Try again.');
}

export interface GraphOptions {
  token: string;
  version: string;
}

type Json = Record<string, unknown>;

export class Graph {
  constructor(private readonly opts: GraphOptions) {}

  private url(path: string): string {
    return `${env.META_GRAPH_URL}/${this.opts.version}/${path.replace(/^\//, '')}`;
  }

  async request<T = Json>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Json | FormData, query?: Record<string, string>): Promise<T> {
    const url = new URL(this.url(path));
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: `Bearer ${this.opts.token}` };
    let payload: string | FormData | undefined;
    if (body instanceof FormData) payload = body;
    else if (body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const e = (data as GraphErrorBody | null)?.error;
      throw new GraphError(e?.message ?? `Graph API ${res.status}`, res.status, e?.code ?? null, e?.error_data?.details ?? null);
    }
    return data as T;
  }

  /* ───────── Messages ───────── */

  /** `POST /{phone-number-id}/messages`. `to` is digits; a BSUID goes in `recipient` instead. */
  async sendMessage(phoneNumberId: string, recipient: { waId: string | null; bsuid: string | null }, message: Json): Promise<{ id: string }> {
    const target = recipient.waId ? { to: recipient.waId } : { recipient: recipient.bsuid };
    const res = await this.request<{ messages?: { id: string }[] }>('POST', `${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...target,
      ...message
    });
    const id = res.messages?.[0]?.id;
    if (!id) throw new GraphError('No message id in response', 500, null, null);
    return { id };
  }

  /** Read receipt, optionally with the typing indicator. */
  async markRead(phoneNumberId: string, waMessageId: string, typing = false): Promise<void> {
    await this.request('POST', `${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: waMessageId,
      ...(typing ? { typing_indicator: { type: 'text' } } : {})
    });
  }

  /* ───────── Media ───────── */

  async uploadMedia(phoneNumberId: string, bytes: Buffer, mime: string, fileName: string): Promise<string> {
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', mime);
    form.set('file', new Blob([new Uint8Array(bytes)], { type: mime }), fileName);
    const res = await this.request<{ id: string }>('POST', `${phoneNumberId}/media`, form);
    return res.id;
  }

  async mediaInfo(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size: number }> {
    return this.request('GET', mediaId);
  }

  /** The media URL needs the same bearer token and expires after 5 minutes. */
  async downloadMedia(url: string, maxBytes: number): Promise<Buffer> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.opts.token}` }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new GraphError(`Media download ${res.status}`, res.status, null, null);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > maxBytes) throw new GraphError('Media too large', 413, null, null);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new GraphError('Media too large', 413, null, null);
    return buf;
  }

  /* ───────── Templates ───────── */

  async listTemplates(wabaId: string): Promise<MetaTemplate[]> {
    const out: MetaTemplate[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await this.request<{ data: MetaTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }>(
        'GET',
        `${wabaId}/message_templates`,
        undefined,
        { fields: 'id,name,language,status,category,components,quality_score,rejected_reason', limit: '100', ...(after ? { after } : {}) }
      );
      out.push(...res.data);
      after = res.paging?.next ? res.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return out;
  }

  async createTemplate(wabaId: string, body: Json): Promise<{ id: string; status?: string; category?: string }> {
    return this.request('POST', `${wabaId}/message_templates`, body);
  }

  async deleteTemplate(wabaId: string, name: string, metaId?: string | null): Promise<void> {
    await this.request('DELETE', `${wabaId}/message_templates`, undefined, { name, ...(metaId ? { hsm_id: metaId } : {}) });
  }

  /* ───────── Phone number and account ───────── */

  async phoneNumber(phoneNumberId: string): Promise<MetaPhoneNumber> {
    return this.request('GET', phoneNumberId, undefined, {
      fields: 'display_phone_number,verified_name,name_status,quality_rating,code_verification_status,status,whatsapp_business_manager_messaging_limit'
    });
  }

  async register(phoneNumberId: string, pin: string): Promise<void> {
    await this.request('POST', `${phoneNumberId}/register`, { messaging_product: 'whatsapp', pin });
  }

  async subscribeApp(wabaId: string): Promise<void> {
    await this.request('POST', `${wabaId}/subscribed_apps`);
  }

  async unsubscribeApp(wabaId: string): Promise<void> {
    await this.request('DELETE', `${wabaId}/subscribed_apps`);
  }

  async businessProfile(phoneNumberId: string): Promise<MetaBusinessProfile | null> {
    const res = await this.request<{ data: MetaBusinessProfile[] }>('GET', `${phoneNumberId}/whatsapp_business_profile`, undefined, {
      fields: 'about,address,description,email,profile_picture_url,websites,vertical'
    });
    return res.data[0] ?? null;
  }

  async updateBusinessProfile(phoneNumberId: string, profile: Partial<MetaBusinessProfile>): Promise<void> {
    await this.request('POST', `${phoneNumberId}/whatsapp_business_profile`, { messaging_product: 'whatsapp', ...profile });
  }

  /* ───────── Calling ───────── */

  async callAction(phoneNumberId: string, body: Json): Promise<{ calls?: { id: string }[]; success?: boolean }> {
    return this.request('POST', `${phoneNumberId}/calls`, { messaging_product: 'whatsapp', ...body });
  }

  async callPermissions(phoneNumberId: string, waId: string): Promise<MetaCallPermissions> {
    return this.request('GET', `${phoneNumberId}/call_permissions`, undefined, { user_wa_id: waId });
  }

  async updateSettings(phoneNumberId: string, settings: Json): Promise<void> {
    await this.request('POST', `${phoneNumberId}/settings`, settings);
  }

  async settings(phoneNumberId: string): Promise<Json> {
    return this.request('GET', `${phoneNumberId}/settings`);
  }

  /* ───────── App-level ───────── */

  /** Embedded Signup: exchange the 30-second code for a business token. */
  static async exchangeCode(version: string, appId: string, appSecret: string, code: string): Promise<string> {
    const url = new URL(`${env.META_GRAPH_URL}/${version}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string } & GraphErrorBody;
    if (!res.ok || !data.access_token) {
      throw new GraphError(data.error?.message ?? 'Code exchange failed', res.status, data.error?.code ?? null, null);
    }
    return data.access_token;
  }

  /** Checks app id and secret by asking for an app token. */
  static async checkApp(version: string, appId: string, appSecret: string): Promise<{ ok: boolean; message: string }> {
    const url = new URL(`${env.META_GRAPH_URL}/${version}/${appId}`);
    url.searchParams.set('fields', 'id,name');
    url.searchParams.set('access_token', `${appId}|${appSecret}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const data = (await res.json().catch(() => ({}))) as { name?: string } & GraphErrorBody;
      if (!res.ok) return { ok: false, message: data.error?.message ?? `HTTP ${res.status}` };
      return { ok: true, message: `Connected to Meta app “${data.name ?? appId}”.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
    }
  }
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
  components: { type: string; format?: string; text?: string; buttons?: { type: string; text: string; url?: string; phone_number?: string }[] }[];
}

export interface MetaPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  name_status?: string;
  quality_rating?: string;
  status?: string;
  whatsapp_business_manager_messaging_limit?: string;
}

export interface MetaBusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

export interface MetaCallPermissions {
  permission?: { status: 'no_permission' | 'temporary' | 'permanent'; expiration_time?: number };
  actions?: { action_name: string; can_perform_action: boolean; limits?: { time_period: string; max_allowed: number; current_usage: number; limit_expiration_time?: number }[] }[];
}
