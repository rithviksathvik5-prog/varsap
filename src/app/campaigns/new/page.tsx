"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { sanitizePhone } from "@/lib/phone";
import { previewText } from "@/lib/templatePreview";
import { COST_PER_MESSAGE_INR, estimateCostInr, formatInr } from "@/lib/cost";

type RawRow = Record<string, unknown>;

interface CreateResult {
  campaignId: string;
  total: number;
  skippedDuplicates: number;
  skippedBlocked: number;
  invalid: number;
  costEstimateInr: number;
}

// datetime-local floor for the schedule picker, computed once at page
// load (render must stay pure, so no Date.now() inline in JSX).
const SCHEDULE_MIN = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60000
)
  .toISOString()
  .slice(0, 16);

function guessColumn(headers: string[], candidates: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h.includes(cand));
    if (idx >= 0) return headers[idx];
  }
  return "";
}

export default function NewCampaignPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [phoneCol, setPhoneCol] = useState("");
  const [orderCol, setOrderCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState<"" | "creating" | "dispatching">("");
  const [apiError, setApiError] = useState("");
  const [created, setCreated] = useState<CreateResult | null>(null);
  const [dupNotice, setDupNotice] = useState("");
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [schedulePast, setSchedulePast] = useState(false);
  const [approvedTemplates, setApprovedTemplates] = useState<
    { name: string; category: string; bodyText?: string }[]
  >([]);
  const [templateName, setTemplateName] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState("");

  // Approved templates for the picker. If the fetch fails the dropdown
  // simply doesn't render and the server falls back to its default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        // Meta can return the same name in multiple languages; keep one
        // option per name so the <select> has no duplicate keys/values.
        const approvedRaw = (json.templates || []).filter(
          (t: { status: string }) => t.status === "APPROVED"
        );
        const approved = approvedRaw.filter(
          (t: { name: string }, i: number) =>
            approvedRaw.findIndex(
              (o: { name: string }) => o.name === t.name
            ) === i
        );
        setApprovedTemplates(approved);
        setDefaultTemplate(json.defaultName || "");
        // Prefer the configured default; otherwise the first real
        // template — never Meta's hello_world sample, which must not be
        // dispatched to real customers by accident.
        const preselect =
          approved.find(
            (t: { name: string }) => t.name === json.defaultName
          )?.name ??
          approved.find((t: { name: string }) => t.name !== "hello_world")
            ?.name ??
          approved[0]?.name ??
          "";
        setTemplateName(preselect);
      } catch {
        // Meta unreachable — picker hidden, server default still applies.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Heuristic nudge only: if a campaign with the same number of rows was
   * created in the last 24h, this file was probably uploaded already.
   * The (phone, orderId) unique index is what actually prevents
   * double-sends — this just saves the employee a confusing "everything
   * was skipped" moment later.
   */
  async function checkRecentDuplicate(rowCount: number) {
    setDupNotice("");
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const match = (json.campaigns || []).find(
        (c: {
          createdAt: string;
          total: number;
          skippedDuplicates: number;
          skippedBlocked: number;
        }) => {
          const uploaded = c.total + c.skippedDuplicates + c.skippedBlocked;
          return (
            new Date(c.createdAt).getTime() >= dayAgo &&
            (uploaded === rowCount || c.total === rowCount)
          );
        }
      );
      if (match) {
        const hours = Math.max(
          1,
          Math.round((Date.now() - new Date(match.createdAt).getTime()) / 3600000)
        );
        setDupNotice(
          `Heads up: campaign “${match.name}” with ${rowCount.toLocaleString(
            "en-IN"
          )} rows was created ${hours}h ago — this may be the same file. ` +
            `You can continue anyway; already-messaged orders are skipped automatically.`
        );
      }
    } catch {
      // Best-effort check only — never block the upload flow on it.
    }
  }

  function loadParsed(hdrs: string[], data: RawRow[]) {
    const clean = hdrs.map((h) => String(h ?? "").trim()).filter(Boolean);
    setHeaders(clean);
    setRows(data);
    setPhoneCol(guessColumn(clean, ["phone", "mobile", "whatsapp", "contact", "number"]));
    setOrderCol(guessColumn(clean, ["order"]));
    setNameCol(guessColumn(clean, ["name", "buyer", "customer"]));
    setCreated(null);
    setApiError("");
    void checkRecentDuplicate(data.length);
  }

  function resetFile() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setPhoneCol("");
    setOrderCol("");
    setNameCol("");
    setParseError("");
    setCreated(null);
    setApiError("");
    setDupNotice("");
    // Clear the native input too, or re-selecting the same file won't
    // fire onChange again.
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File) {
    setParseError("");
    setFileName(file.name);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
        if (json.length === 0) throw new Error("The first sheet is empty.");
        loadParsed(Object.keys(json[0]), json);
      } else {
        Papa.parse<RawRow>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => {
            if (!res.meta.fields || res.data.length === 0) {
              setParseError("Couldn't find a header row or any data rows.");
              return;
            }
            loadParsed(res.meta.fields, res.data);
          },
          error: (err) => setParseError(err.message),
        });
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }

  const mapped = useMemo(() => {
    if (!phoneCol || !orderCol) return { valid: [] as { phone: string; customerName: string; orderId: string }[], invalid: 0 };
    let invalid = 0;
    const valid: { phone: string; customerName: string; orderId: string }[] = [];
    for (const row of rows) {
      const phone = sanitizePhone(row[phoneCol]);
      const orderId = String(row[orderCol] ?? "").trim();
      if (!phone || !orderId) {
        invalid++;
        continue;
      }
      valid.push({
        phone,
        orderId,
        customerName: nameCol ? String(row[nameCol] ?? "").trim() : "",
      });
    }
    return { valid, invalid };
  }, [rows, phoneCol, orderCol, nameCol]);

  const cost = estimateCostInr(mapped.valid.length);

  async function createCampaign() {
    setBusy("creating");
    setApiError("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          rows: mapped.valid,
          ...(templateName ? { templateName } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setCreated(json);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const scheduleInvalid =
    sendMode === "later" && (scheduleAt === "" || schedulePast);

  async function dispatch() {
    if (!created) return;
    setBusy("dispatching");
    setApiError("");
    try {
      const res = await fetch(`/api/campaigns/${created.campaignId}/dispatch`, {
        method: "POST",
        ...(sendMode === "later"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scheduledFor: new Date(scheduleAt).toISOString(),
              }),
            }
          : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      router.push(`/campaigns/${created.campaignId}`);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
      setBusy("");
    }
  }

  const selectCls =
    "w-full bg-white border border-hairline rounded-md px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-[820px] px-5 py-12">
      <h1 className="text-[40px] leading-[1.1] font-semibold">New Campaign</h1>
      <p className="mt-2 text-ink-muted-80 tracking-normal">
        Upload an Amazon order export, map the columns, review the cost, and
        dispatch.
      </p>

      {/* Step 1: name + file */}
      <section className="mt-10 bg-white border border-hairline rounded-lg p-6">
        <h2 className="text-[21px] font-semibold">1. Upload</h2>
        <label className="block mt-4 text-sm font-semibold">
          Campaign name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. June Amazon orders"
            className="mt-1 w-full bg-white border border-hairline rounded-md px-3 py-2 font-normal"
          />
        </label>
        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press bg-pearl border border-divider-soft rounded-md px-4 py-2 text-sm text-ink-muted-80 cursor-pointer"
          >
            Choose Excel / CSV file
          </button>
          {fileName && (
            <>
              <span className="ml-3 text-sm text-ink-muted-48">
                {fileName} · {rows.length.toLocaleString("en-IN")} rows
              </span>
              <button
                type="button"
                onClick={resetFile}
                className="press ml-3 text-sm text-[#d70015] cursor-pointer"
              >
                ✕ Remove
              </button>
            </>
          )}
        </div>
        {parseError && (
          <p className="mt-3 text-sm text-[#d70015]">{parseError}</p>
        )}
        {dupNotice && (
          <p className="mt-3 text-sm bg-[#fff6e5] border border-[#f0d9a8] text-[#8a6100] rounded-md px-4 py-3">
            {dupNotice}
          </p>
        )}
      </section>

      {/* Step 2: column mapping */}
      {headers.length > 0 && (
        <section className="mt-6 bg-white border border-hairline rounded-lg p-6">
          <h2 className="text-[21px] font-semibold">2. Map columns</h2>
          <div className="mt-4 grid sm:grid-cols-3 gap-4 text-sm">
            <label className="font-semibold">
              Phone number *
              <select
                value={phoneCol}
                onChange={(e) => setPhoneCol(e.target.value)}
                className={selectCls + " mt-1 font-normal"}
              >
                <option value="">— select —</option>
                {headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="font-semibold">
              Amazon Order ID *
              <select
                value={orderCol}
                onChange={(e) => setOrderCol(e.target.value)}
                className={selectCls + " mt-1 font-normal"}
              >
                <option value="">— select —</option>
                {headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="font-semibold">
              Customer name
              <select
                value={nameCol}
                onChange={(e) => setNameCol(e.target.value)}
                className={selectCls + " mt-1 font-normal"}
              >
                <option value="">— none —</option>
                {headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
          </div>

          {phoneCol && orderCol && (
            <div className="mt-5 text-sm">
              <span className="font-semibold">
                {mapped.valid.length.toLocaleString("en-IN")} valid recipients
              </span>
              {mapped.invalid > 0 && (
                <span className="text-ink-muted-48">
                  {" "}
                  · {mapped.invalid.toLocaleString("en-IN")} rows skipped
                  (invalid phone or missing order ID)
                </span>
              )}
            </div>
          )}

          {/* Preview of the mapped result so a wrong column choice is
              obvious before any campaign is created. */}
          {phoneCol && orderCol && mapped.valid.length > 0 && (
            <div className="mt-4 border border-hairline rounded-md overflow-hidden">
              <div className="px-4 py-2 bg-parchment text-xs font-semibold text-ink-muted-80">
                Preview — first {Math.min(3, mapped.valid.length)} recipients
                as they will be sent
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-ink-muted-48 border-b border-divider-soft text-xs">
                    <th className="px-4 py-2 font-semibold">Phone</th>
                    <th className="px-4 py-2 font-semibold">Order ID</th>
                    <th className="px-4 py-2 font-semibold">Customer name</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.valid.slice(0, 3).map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-divider-soft last:border-0"
                    >
                      <td className="px-4 py-2 tabular-nums">{r.phone}</td>
                      <td className="px-4 py-2">{r.orderId}</td>
                      <td className="px-4 py-2">{r.customerName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Step 3: cost + create */}
      {mapped.valid.length > 0 && !created && (
        <section className="mt-6 bg-white border border-hairline rounded-lg p-6">
          <h2 className="text-[21px] font-semibold">
            3. Template &amp; cost check
          </h2>
          {approvedTemplates.length > 0 && (
            <label className="block mt-4 text-sm font-semibold sm:max-w-[380px]">
              Message template
              <select
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className={selectCls + " mt-1 font-normal"}
              >
                {approvedTemplates.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} —{" "}
                    {t.category === "MARKETING" ? "Marketing" : "Utility"}
                    {t.name === defaultTemplate ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <span className="block mt-1 text-xs font-normal text-ink-muted-48">
                Utility templates cost less per message than Marketing ones.
              </span>
              {(() => {
                const sel = approvedTemplates.find(
                  (t) => t.name === templateName
                );
                return sel?.bodyText ? (
                  <span className="block mt-3 font-normal bg-parchment border border-hairline rounded-lg rounded-tl-none px-4 py-3 whitespace-pre-wrap">
                    {previewText(sel.bodyText)}
                  </span>
                ) : null;
              })()}
            </label>
          )}
          <div className="mt-4 bg-parchment rounded-md p-5">
            <div className="text-[34px] font-semibold">{formatInr(cost)}</div>
            <p className="text-sm text-ink-muted-80 mt-1 tracking-normal">
              Estimated Meta API cost —{" "}
              {mapped.valid.length.toLocaleString("en-IN")} messages ×{" "}
              {formatInr(COST_PER_MESSAGE_INR)} per template conversation.
              Duplicates and opted-out customers are removed in the next step
              and will lower this number.
            </p>
            {approvedTemplates.find((t) => t.name === templateName)
              ?.category === "MARKETING" && (
              <p className="mt-2 text-xs text-[#8a6100]">
                This is a Marketing template — Meta bills marketing
                conversations at a higher rate than the utility estimate
                shown above, so the real cost will be higher.
              </p>
            )}
          </div>
          {apiError && (
            <p className="mt-3 text-sm text-[#d70015]">{apiError}</p>
          )}
          <button
            type="button"
            disabled={!name.trim() || busy !== ""}
            onClick={createCampaign}
            className="press mt-5 bg-primary text-white rounded-full px-6 py-3 cursor-pointer disabled:opacity-40"
          >
            {busy === "creating" ? "Checking duplicates…" : "Create campaign"}
          </button>
          {!name.trim() && (
            <span className="ml-3 text-sm text-ink-muted-48">
              Give the campaign a name first.
            </span>
          )}
        </section>
      )}

      {/* Step 4: dispatch */}
      {created && (
        <section className="mt-6 bg-tile-1 text-white rounded-lg p-8">
          <h2 className="text-[21px] font-semibold">4. Dispatch</h2>
          <p className="mt-3 text-[#cccccc] tracking-normal">
            After de-duplication,{" "}
            <strong className="text-white">
              {created.total.toLocaleString("en-IN")} customers
            </strong>{" "}
            will receive a WhatsApp message.
          </p>
          <ul className="mt-3 text-sm text-[#cccccc] space-y-1">
            <li>
              {created.skippedDuplicates.toLocaleString("en-IN")} skipped —
              already messaged for the same order
            </li>
            <li>
              {created.skippedBlocked.toLocaleString("en-IN")} skipped — opted
              out previously
            </li>
          </ul>
          <div className="mt-4 text-[28px] font-semibold">
            {formatInr(created.costEstimateInr)}
            <span className="text-sm font-normal text-[#cccccc] ml-2">
              final estimated cost
            </span>
          </div>
          {apiError && (
            <p className="mt-3 text-sm text-[#ff6961]">{apiError}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-[#cccccc]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="sendMode"
                checked={sendMode === "now"}
                onChange={() => setSendMode("now")}
              />
              Send now
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="sendMode"
                checked={sendMode === "later"}
                onChange={() => setSendMode("later")}
              />
              Schedule for later
            </label>
            {sendMode === "later" && (
              <input
                type="datetime-local"
                value={scheduleAt}
                min={SCHEDULE_MIN}
                onChange={(e) => {
                  const v = e.target.value;
                  setScheduleAt(v);
                  setSchedulePast(
                    v !== "" && new Date(v).getTime() <= Date.now()
                  );
                }}
                className="bg-white text-black border border-hairline rounded-md px-3 py-2 text-sm"
              />
            )}
          </div>
          {sendMode === "later" && schedulePast && (
            <p className="mt-2 text-sm text-[#ff6961]">
              That time has already passed — pick a future time.
            </p>
          )}
          <button
            type="button"
            disabled={busy !== "" || created.total === 0 || scheduleInvalid}
            onClick={dispatch}
            className="press mt-6 bg-primary text-white rounded-full px-7 py-3.5 text-[18px] font-light cursor-pointer disabled:opacity-40"
          >
            {busy === "dispatching"
              ? sendMode === "later"
                ? "Scheduling…"
                : "Handing to queue…"
              : sendMode === "later"
                ? `Schedule ${created.total.toLocaleString("en-IN")} messages`
                : `Dispatch ${created.total.toLocaleString("en-IN")} messages`}
          </button>
          <p className="mt-4 text-xs text-[#7a7a7a]">
            Sending runs in the background at one message per second — you can
            close this tab immediately after dispatching.
          </p>
        </section>
      )}
    </div>
  );
}
