const GRAPH_VERSION = "v21.0";

export interface MetaTemplate {
  id: string;
  name: string;
  status: string; // APPROVED | PENDING | REJECTED | ...
  category: string; // UTILITY | MARKETING | AUTHENTICATION
  language: string;
  /** The BODY component's text, with {{name}}-style variables intact. */
  bodyText?: string;
}

export interface TemplatesResult {
  ok: boolean;
  templates?: MetaTemplate[];
  error?: string;
}

export interface CreateTemplateResult {
  ok: boolean;
  id?: string;
  status?: string;
  error?: string;
}

function getConfig(): { token: string; wabaId: string } | null {
  const token = process.env.META_ACCESS_TOKEN;
  const wabaId = process.env.META_WABA_ID;
  if (!token || !wabaId) return null;
  return { token, wabaId };
}

/** Lists this WhatsApp Business Account's message templates. */
export async function listTemplates(): Promise<TemplatesResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      error: "META_ACCESS_TOKEN / META_WABA_ID not configured",
    };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${config.wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${config.token}` } }
    );
  } catch (e) {
    return { ok: false, error: `Network error: ${e}` };
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: json?.error?.message || `Meta API HTTP ${res.status}`,
    };
  }
  interface RawTemplate extends MetaTemplate {
    components?: Array<{ type?: string; text?: string }>;
  }
  const templates = ((json?.data ?? []) as RawTemplate[]).map(
    ({ components, ...t }) => ({
      ...t,
      bodyText: components?.find((c) => c.type === "BODY")?.text,
    })
  );
  return { ok: true, templates };
}

/**
 * Submits a new template for Meta review. Variables in the body use the
 * named format ({{name}}, not positional {{1}}) — the same format
 * sendTemplateMessage in meta.ts sends at delivery time. Every variable
 * needs an example value or Meta rejects the submission.
 */
export async function createTemplate(opts: {
  name: string;
  category: "UTILITY" | "MARKETING";
  language: string;
  bodyText: string;
}): Promise<CreateTemplateResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      error: "META_ACCESS_TOKEN / META_WABA_ID not configured",
    };
  }

  const variables = [
    ...new Set(
      [...opts.bodyText.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map(
        (m) => m[1]
      )
    ),
  ];
  const body = {
    name: opts.name,
    language: opts.language,
    category: opts.category,
    // Without this Meta defaults to POSITIONAL ({{1}}), reads {{name}} as
    // malformed, silently drops the named-param examples and auto-rejects
    // the submission with INVALID_FORMAT.
    parameter_format: "NAMED",
    components: [
      {
        type: "BODY",
        text: opts.bodyText,
        ...(variables.length > 0
          ? {
              example: {
                body_text_named_params: variables.map((v) => ({
                  param_name: v,
                  example: v === "name" ? "Priya" : "example",
                })),
              },
            }
          : {}),
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${config.wabaId}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
  } catch (e) {
    return { ok: false, error: `Network error: ${e}` };
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: json?.error?.error_user_msg || json?.error?.message || `Meta API HTTP ${res.status}`,
    };
  }
  return { ok: true, id: json?.id, status: json?.status };
}
