// =========================================================================
// Branded email template (pure function: used by the server to send, and by the
// admin screen to preview). Indigo header, emerald button, plain-language footer
// with the one-click unsubscribe link required by the NDPA / NDPC GAID.
// =========================================================================
import { SITE } from '@/lib/site';

export interface EmailContent {
  subject: string;
  preheader?: string | null;
  body: string;           // plain text: blank line = new paragraph, **bold**, links auto-detected
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatInline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" style="color:#4338CA;font-weight:600;">$1</a>');
  return s.replace(/\n/g, '<br>');
}

export function bodyToHtml(body: string): string {
  return body
    .trim()
    .split(/\n\s*\n/)
    .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1E1B4B;">${formatInline(p)}</p>`)
    .join('');
}

export function bodyToText(c: EmailContent, unsubscribeUrl: string): string {
  const cta = c.ctaLabel && c.ctaUrl ? `\n\n${c.ctaLabel}: ${c.ctaUrl}` : '';
  return `${c.body.trim().replace(/\*\*(.+?)\*\*/g, '$1')}${cta}\n\n—\n${SITE.name} · ${SITE.url}\nYou are receiving this because you subscribed to ${SITE.name} updates.\nUnsubscribe: ${unsubscribeUrl}`;
}

export function renderEmail(c: EmailContent, unsubscribeUrl: string, reason = `You're receiving this because you subscribed to ${SITE.name} updates.`): string {
  const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? escapeHtml(u) : null);
  const cta = c.ctaLabel && safeUrl(c.ctaUrl)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="border-radius:999px;background:#34D399;">
         <a href="${safeUrl(c.ctaUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#1E1B4B;text-decoration:none;border-radius:999px;">${escapeHtml(c.ctaLabel)}</a>
       </td></tr></table>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;max-height:0;overflow:hidden;">${escapeHtml(c.preheader || '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E2E8F0;">
        <tr><td style="background:#312E81;padding:20px 28px;">
          <span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#34D399;">qozob</span>
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-left:4px;"></span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1E1B4B;">${escapeHtml(c.subject)}</h1>
          ${bodyToHtml(c.body)}
          ${cta}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:12px;line-height:1.6;color:#475569;">
          ${escapeHtml(reason)}<br>
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:#4338CA;font-weight:600;">Unsubscribe instantly</a> ·
          <a href="${SITE.url}/privacy" style="color:#4338CA;">Privacy policy</a> ·
          <a href="mailto:${SITE.contactEmail}" style="color:#4338CA;">${SITE.contactEmail}</a><br>
          ${SITE.name}, ${SITE.country}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

