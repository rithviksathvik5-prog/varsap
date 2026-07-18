"use client";

import React, { useCallback, useEffect, useState } from "react";

import { previewText } from "@/lib/templatePreview";

interface TemplateDto {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  bodyText?: string;
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-[#e3f5e8] text-[#1d7a3a]" },
  PENDING: { label: "In review", cls: "bg-[#fff6e5] text-[#8a6100]" },
  REJECTED: { label: "Rejected", cls: "bg-[#fdeaea] text-[#c0392b]" },
};

function pill(status: string) {
  return (
    STATUS_PILL[status] ?? {
      label: status.toLowerCase().replace(/_/g, " "),
      cls: "bg-parchment text-ink-muted-80",
    }
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState("");

  const [name, setName] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/templates", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTemplates(json.templates);
      setListError("");
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    return () => clearTimeout(initial);
  }, [refresh]);

  async function submit() {
    setBusy(true);
    setFormError("");
    setSubmitted("");
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bodyText, category, language }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSubmitted(name);
      setName("");
      setBodyText("");
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full bg-white border border-hairline rounded-md px-3 py-2 text-sm font-normal";

  return (
    <div className="mx-auto max-w-[820px] px-5 py-12">
      <h1 className="text-[40px] leading-[1.1] font-semibold">
        Message Templates
      </h1>
      <p className="mt-2 text-ink-muted-80 tracking-normal">
        Create a WhatsApp template and submit it to Meta for approval — no
        Meta console needed. Approval usually takes minutes to a few hours.
      </p>

      <section className="mt-10 bg-white border border-hairline rounded-lg p-6">
        <h2 className="text-[21px] font-semibold">New template</h2>
        <div className="mt-4 grid sm:grid-cols-3 gap-4 text-sm">
          <label className="font-semibold sm:col-span-1">
            Template name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. feedback_request_v2"
              className={inputCls}
            />
            <span className="block mt-1 text-xs font-normal text-ink-muted-48">
              Lowercase letters, numbers, underscores only.
            </span>
          </label>
          <label className="font-semibold">
            Category
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value === "MARKETING" ? "MARKETING" : "UTILITY")
              }
              className={inputCls}
            >
              <option value="UTILITY">Utility (order updates — cheaper)</option>
              <option value="MARKETING">Marketing (promotions)</option>
            </select>
          </label>
          <label className="font-semibold">
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputCls}
            >
              <option value="en">English (en)</option>
              <option value="en_US">English US (en_US)</option>
              <option value="hi">Hindi (hi)</option>
            </select>
          </label>
        </div>
        <label className="block mt-4 text-sm font-semibold">
          Message body
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={4}
            placeholder="Hi {{name}}, thanks for your order! We'd love to hear your feedback."
            className={inputCls}
          />
          <span className="block mt-1 text-xs font-normal text-ink-muted-48">
            Type {"{{name}}"} where the customer&apos;s name should appear.
          </span>
        </label>
        {formError && (
          <p className="mt-3 text-sm text-[#d70015]">{formError}</p>
        )}
        {submitted && (
          <p className="mt-3 text-sm bg-[#e3f5e8] text-[#1d7a3a] rounded-md px-4 py-3">
            “{submitted}” submitted to Meta for review. Refresh the list below
            to check its status.
          </p>
        )}
        <button
          type="button"
          disabled={busy || !name.trim() || !bodyText.trim()}
          onClick={submit}
          className="press mt-5 bg-primary text-white rounded-full px-6 py-3 cursor-pointer disabled:opacity-40"
        >
          {busy ? "Submitting to Meta…" : "Submit for review"}
        </button>
      </section>

      <section className="mt-6 bg-white border border-hairline rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-divider-soft flex items-center justify-between">
          <span className="text-[21px] font-semibold">Existing templates</span>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="press bg-pearl border border-divider-soft rounded-md px-4 py-2 text-sm text-ink-muted-80 cursor-pointer disabled:opacity-40"
          >
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        </div>
        {listError ? (
          <p className="px-6 py-8 text-sm text-[#d70015]">{listError}</p>
        ) : templates.length === 0 ? (
          <p className="px-6 py-8 text-sm text-ink-muted-48">
            {loading ? "Loading…" : "No templates yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-ink-muted-48 border-b border-divider-soft">
                  <th className="px-6 py-3 font-semibold">Name</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold">Language</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Message</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <React.Fragment key={t.id}>
                    <tr className="border-b border-divider-soft last:border-0">
                      <td className="px-6 py-3 font-medium">{t.name}</td>
                      <td className="px-6 py-3">{t.category}</td>
                      <td className="px-6 py-3">{t.language}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill(t.status).cls}`}
                        >
                          {pill(t.status).label}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === t.id ? "" : t.id)
                          }
                          className="press text-primary text-sm cursor-pointer"
                        >
                          {expandedId === t.id ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === t.id && (
                      <tr className="border-b border-divider-soft last:border-0">
                        <td colSpan={5} className="px-6 py-4 bg-parchment">
                          {t.bodyText ? (
                            <>
                              <div className="max-w-[440px] bg-white border border-hairline rounded-lg rounded-tl-none px-4 py-3 text-sm whitespace-pre-wrap shadow-sm">
                                {previewText(t.bodyText)}
                              </div>
                              <p className="mt-2 text-xs text-ink-muted-48">
                                Preview with a sample customer name — each
                                customer sees their own name where the template
                                says {"{{name}}"}.
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-ink-muted-48">
                              Meta didn&apos;t return a message body for this
                              template.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-ink-muted-48">
        Once a template is approved, it can be picked per campaign on the New
        Campaign page. The <code>META_TEMPLATE_NAME</code> setting is only the
        preselected default.
      </p>
    </div>
  );
}
