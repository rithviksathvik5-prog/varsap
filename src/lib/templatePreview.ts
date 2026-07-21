/**
 * Fills {{name}}-style template variables with sample values so
 * non-technical users see the message as a customer would receive it.
 */
export function previewText(bodyText: string): string {
  return bodyText.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, v: string) =>
    v.toLowerCase() === "name" ? "Priya" : "example"
  );
}

/**
 * The distinct variable names a template body references, lowercased.
 * The send path can only fill {{name}} (the app collects no other
 * per-customer field), so this is used both to reject unfillable
 * templates at campaign creation and to decide which parameters to send.
 */
export function extractVariables(bodyText: string): string[] {
  return [
    ...new Set(
      [...bodyText.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) =>
        m[1].toLowerCase()
      )
    ),
  ];
}
