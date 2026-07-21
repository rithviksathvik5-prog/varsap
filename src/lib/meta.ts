const GRAPH_VERSION = "v21.0";

export interface SendResult {
  ok: boolean;
  metaMessageId?: string;
  error?: string;
  /** true when the failure is transient (network/5xx) and worth retrying */
  retryable?: boolean;
}

/**
 * Sends an approved WhatsApp template message via the Meta Cloud API.
 * The template's {{name}} variable receives the customer's name.
 */
export async function sendTemplateMessage(opts: {
  phone: string;
  customerName: string;
  templateName: string;
  templateLang: string;
  /**
   * The template's body variables. When known (campaign created via the
   * picker), the body parameter is sent only if the template references
   * {{name}} — so parameterless templates don't trigger Meta's #132000
   * param-count error. Undefined on legacy campaigns → fall back to the
   * old assumption (send {{name}} for everything except hello_world).
   */
  templateVariables?: string[];
}): Promise<SendResult> {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: "META_ACCESS_TOKEN / META_PHONE_NUMBER_ID not configured",
    };
  }

  // Send the {{name}} body parameter only when the template actually uses
  // it. A mismatch between parameters sent and the template's variables is
  // Meta error #132000. When the variables are unknown (legacy campaign),
  // keep the old behavior: hello_world takes none, everything else takes
  // {{name}}.
  const expectsName =
    opts.templateVariables !== undefined
      ? opts.templateVariables.includes("name")
      : opts.templateName !== "hello_world";

  const body = {
    messaging_product: "whatsapp",
    to: opts.phone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.templateLang },
      ...(expectsName
        ? {
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    parameter_name: "name",
                    text: opts.customerName || "there",
                  },
                ],
              },
            ],
          }
        : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
  } catch (e) {
    return { ok: false, error: `Network error: ${e}`, retryable: true };
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Meta API HTTP ${res.status}`;
    return { ok: false, error: msg, retryable: res.status >= 500 };
  }
  return { ok: true, metaMessageId: json?.messages?.[0]?.id };
}
