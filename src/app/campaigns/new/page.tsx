"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { sanitizePhone } from "@/lib/phone";
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

  function loadParsed(hdrs: string[], data: RawRow[]) {
    const clean = hdrs.map((h) => String(h ?? "").trim()).filter(Boolean);
    setHeaders(clean);
    setRows(data);
    setPhoneCol(guessColumn(clean, ["phone", "mobile", "whatsapp", "contact", "number"]));
    setOrderCol(guessColumn(clean, ["order"]));
    setNameCol(guessColumn(clean, ["name", "buyer", "customer"]));
    setCreated(null);
    setApiError("");
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
        body: JSON.stringify({ name, rows: mapped.valid }),
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

  async function dispatch() {
    if (!created) return;
    setBusy("dispatching");
    setApiError("");
    try {
      const res = await fetch(`/api/campaigns/${created.campaignId}/dispatch`, {
        method: "POST",
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
            <span className="ml-3 text-sm text-ink-muted-48">
              {fileName} · {rows.length.toLocaleString("en-IN")} rows
            </span>
          )}
        </div>
        {parseError && (
          <p className="mt-3 text-sm text-[#d70015]">{parseError}</p>
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
        </section>
      )}

      {/* Step 3: cost + create */}
      {mapped.valid.length > 0 && !created && (
        <section className="mt-6 bg-white border border-hairline rounded-lg p-6">
          <h2 className="text-[21px] font-semibold">3. Pre-flight cost check</h2>
          <div className="mt-4 bg-parchment rounded-md p-5">
            <div className="text-[34px] font-semibold">{formatInr(cost)}</div>
            <p className="text-sm text-ink-muted-80 mt-1 tracking-normal">
              Estimated Meta API cost —{" "}
              {mapped.valid.length.toLocaleString("en-IN")} messages ×{" "}
              {formatInr(COST_PER_MESSAGE_INR)} per template conversation.
              Duplicates and opted-out customers are removed in the next step
              and will lower this number.
            </p>
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
          <button
            type="button"
            disabled={busy !== "" || created.total === 0}
            onClick={dispatch}
            className="press mt-6 bg-primary text-white rounded-full px-7 py-3.5 text-[18px] font-light cursor-pointer disabled:opacity-40"
          >
            {busy === "dispatching"
              ? "Handing to queue…"
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
