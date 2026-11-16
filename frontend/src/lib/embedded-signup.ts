/**
 * Meta Embedded Signup in the browser. Loads the Facebook JS SDK, opens the signup popup with
 * the platform's configuration id, and resolves with the 30-second code plus the WhatsApp
 * Business Account id and phone number id the popup reports. The API exchanges the code for a token.
 */

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}
interface FbSdk {
  init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (cb: (r: FbLoginResponse) => void, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

export interface SignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

let sdk: Promise<FbSdk> | null = null;

function loadSdk(appId: string, version: string): Promise<FbSdk> {
  sdk ??= new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => {
      sdk = null;
      reject(new Error('Could not load Facebook. Check that facebook.com is not blocked.'));
    };
    document.body.appendChild(s);
  });
  return sdk;
}

export async function runEmbeddedSignup(cfg: { appId: string; configId: string; graphVersion: string }): Promise<SignupResult> {
  if (!cfg.appId || !cfg.configId) throw new Error('Meta app id or Embedded Signup configuration id is not set in Platform → Meta settings.');
  const FB = await loadSdk(cfg.appId, cfg.graphVersion);
  return new Promise((resolve, reject) => {
    let ids: { wabaId: string; phoneNumberId: string } | null = null;
    let code: string | null = null;
    const finish = () => {
      if (ids && code) {
        window.removeEventListener('message', onMessage);
        resolve({ code, ...ids });
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (String(data.event).startsWith('FINISH') && data.data?.phone_number_id && data.data?.waba_id) {
          ids = { wabaId: String(data.data.waba_id), phoneNumberId: String(data.data.phone_number_id) };
          finish();
        } else if (data.event === 'CANCEL') {
          window.removeEventListener('message', onMessage);
          reject(new Error(data.data?.error_message ?? 'Signup was cancelled before it finished.'));
        }
      } catch {
        /* not ours */
      }
    };
    window.addEventListener('message', onMessage);
    FB.login(
      r => {
        if (r.authResponse?.code) {
          code = r.authResponse.code;
          finish();
          setTimeout(() => {
            if (!ids) {
              window.removeEventListener('message', onMessage);
              reject(new Error('Facebook did not report the WhatsApp number. Finish every step in the popup.'));
            }
          }, 4000);
        } else {
          window.removeEventListener('message', onMessage);
          reject(new Error('Facebook sign-in was closed.'));
        }
      },
      { config_id: cfg.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: '3' } }
    );
  });
}
