export type WhatsAppDelivery = { status: 'pending' | 'accepted' | 'failed'; messageId?: string };

/** Optional server-only sender. Click-to-chat remains available without Cloud API credentials. */
export async function sendApprovedWhatsAppTemplate(input: { to: string; consented: boolean; components?: unknown[] }): Promise<WhatsAppDelivery> {
  if (!input.consented) return { status: 'failed' };
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
  const version = process.env.WHATSAPP_GRAPH_API_VERSION;
  if (!token || !phoneNumberId || !templateName || !version) return { status: 'pending' };
  const to = input.to.replace(/\D/g, '');
  if (to.length < 7 || to.length > 15) return { status: 'failed' };
  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: { name: templateName, language: { code: language }, ...(input.components ? { components: input.components } : {}) },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { status: 'failed' };
    const body = await response.json() as { messages?: Array<{ id?: string }> };
    const messageId = body.messages?.[0]?.id;
    return messageId ? { status: 'accepted', messageId } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}
