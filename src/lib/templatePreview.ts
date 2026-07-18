/**
 * Fills {{name}}-style template variables with sample values so
 * non-technical users see the message as a customer would receive it.
 */
export function previewText(bodyText: string): string {
  return bodyText.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, v: string) =>
    v.toLowerCase() === "name" ? "Priya" : "example"
  );
}
