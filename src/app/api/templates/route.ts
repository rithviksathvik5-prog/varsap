import { NextResponse } from "next/server";
import { auth, isEmailAllowed } from "@/auth";
import { createTemplate, listTemplates } from "@/lib/metaTemplates";

export async function GET() {
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await listTemplates();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    templates: result.templates,
    // The env-configured template doubles as the campaign default; the
    // New Campaign picker preselects and labels it.
    defaultName: process.env.META_TEMPLATE_NAME || "feedback_request",
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const bodyText =
    typeof body?.bodyText === "string" ? body.bodyText.trim() : "";
  const category = body?.category === "MARKETING" ? "MARKETING" : "UTILITY";
  const language = typeof body?.language === "string" ? body.language : "en";

  // Meta requires lowercase/underscore names, and the name must later
  // match META_TEMPLATE_NAME exactly — reject typos before they cost a
  // review cycle.
  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    return NextResponse.json(
      {
        error:
          "Template name must use only lowercase letters, numbers and underscores (e.g. feedback_request).",
      },
      { status: 400 }
    );
  }
  if (!bodyText || bodyText.length > 1024) {
    return NextResponse.json(
      { error: "Body text is required (max 1,024 characters)." },
      { status: 400 }
    );
  }
  // Catch malformed variables ({{Name}}, {{ 1 }}, unbalanced braces)
  // before Meta does, with a clearer message.
  const braces = bodyText.match(/\{\{[^}]*\}\}/g) ?? [];
  for (const b of braces) {
    if (!/^\{\{\s*[a-z][a-z0-9_]*\s*\}\}$/.test(b)) {
      return NextResponse.json(
        {
          error: `Variable ${b} is invalid — use lowercase names like {{name}}.`,
        },
        { status: 400 }
      );
    }
  }
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) {
    return NextResponse.json(
      { error: "Invalid language code." },
      { status: 400 }
    );
  }

  const result = await createTemplate({ name, category, language, bodyText });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ id: result.id, status: result.status });
}
