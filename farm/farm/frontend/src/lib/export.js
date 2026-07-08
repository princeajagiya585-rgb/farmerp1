// Client-side export helpers — CSV (plain) and Excel (.xlsx via SheetJS).
import * as XLSX from "xlsx";

function cell(value) {
  if (value == null) return "";
  const s = String(value).replace(/\"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

/**
 * Download a blob using multiple fallback strategies for maximum browser/WebView
 * compatibility. In regular browsers we use the standard <a> download trick; in
 * Android WebViews (which block programmatic <a>.click()), we fall back to
 * window.location.href which forces the WebView to handle the download natively.
 */
function downloadBlob(blob, filename) {
  // 1. msSaveBlob (IE / Edge Legacy)
  if (navigator.msSaveBlob) {
    navigator.msSaveBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);

  // 2. Android WebViews block programmatic <a>.click() — navigate directly so
  //    the native download manager handles it. Detected via the "wv" UA token.
  if (/\bwv\b/.test(navigator.userAgent)) {
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }

  // 3. Standard browsers: a single <a> click — exactly ONE download.
  //    (The old code also fired a delayed location.href fallback whose "did
  //    the click work?" check was always true, so every export downloaded
  //    the file twice.)
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Export rows to a proper Excel .xlsx file with formatted headers.
 * Uses multi-fallback download for Android WebView compatibility.
 *
 * @param {Array} rows
 * @param {Array} columns - [{key, header, render?}]  (render is used if available, otherwise row[key])
 * @param {string} filename  (e.g. "field-activities.xlsx")
 * @param {string} [sheetName="Data"]
 */
export function exportExcel(rows, columns, filename = "export.xlsx", sheetName = "Data") {
  const cols = columns.filter((c) => c.key !== "_actions");
  const header = cols.map((c) => c.header);
  const data = rows.map((r) =>
    cols.map((c) => {
      const v = c.render ? c.render(r) : r[c.key];
      // Convert React elements or objects to plain text
      if (v == null) return "";
      if (typeof v === "object" && v.props) return extractText(v);
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Style header row — green background, white bold text
  ws["!cols"] = cols.map(() => ({ wch: 18 }));
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: "16A34A" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E5E7EB" } },
        bottom: { style: "thin", color: { rgb: "E5E7EB" } },
        left: { style: "thin", color: { rgb: "E5E7EB" } },
        right: { style: "thin", color: { rgb: "E5E7EB" } },
      },
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Generate the XLSX file as a blob and download with fallbacks
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
}

/** Extract text from a React rendered value (simple heuristic). */
function extractText(vnode) {
  if (!vnode) return "";
  if (typeof vnode === "string") return vnode;
  if (Array.isArray(vnode)) return vnode.map(extractText).join(" ");
  if (vnode.props) {
    const children = vnode.props.children;
    if (children) return extractText(children);
    const label = vnode.props.label || vnode.props.value || vnode.props.children;
    return label ? String(label) : "";
  }
  return String(vnode);
}

/**
 * Export multiple sheets to a single Excel .xlsx file.
 * Uses multi-fallback download for Android WebView compatibility.
 *
 * @param {Array} data - [{ name: "Sheet1", data: [{ col1: val, col2: val }] }]
 * @param {string} filename - e.g. "analysis.xlsx"
 * @param {string} [title="Data"]
 */
export function exportExcelMultiSheet(data, filename = "export.xlsx", title = "Data") {
  const wb = XLSX.utils.book_new();

  data.forEach((sheet) => {
    if (!sheet.data || sheet.data.length === 0) return;

    const rows = sheet.data;
    const cols = Object.keys(rows[0] || {});
    const header = cols;
    const rowsData = rows.map((r) => cols.map((c) => {
      const v = r[c];
      if (v == null) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }));

    const ws = XLSX.utils.aoa_to_sheet([header, ...rowsData]);

    // Style header row
    ws["!cols"] = cols.map(() => ({ wch: 18 }));
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = {
        fill: { fgColor: { rgb: "16A34A" } },
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  });

  // Generate the XLSX file as a blob and download with fallbacks
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
}

/**
 * Export rows to plain CSV (fallback).
 * Uses multi-fallback download for Android WebView compatibility.
 *
 * @param {Array} rows
 * @param {Array} columns - [{key, header, render?}]
 * @param {string} filename
 */
export function exportCSV(rows, columns, filename = "export.csv") {
  const cols = columns.filter((c) => c.key !== "_actions");
  const header = cols.map((c) => cell(c.header)).join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const v = c.render ? c.render(r) : r[c.key];
          if (v == null) return cell("");
          if (typeof v === "object" && v.props) return cell(extractText(v));
          return cell(String(v));
        })
        .join(",")
    )
    .join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

/**
 * Open a print-friendly window (user can "Save as PDF").
 */
export function printTable(title, rows, columns) {
  const cols = columns.filter((c) => c.key !== "_actions");
  const head = cols.map((c) => `<th>${c.header}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${cols
          .map((c) => `<td>${valueToText(c.render ? c.render(r) : r[c.key])}</td>`)
          .join("")}</tr>`
    )
    .join("");
  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>${title}</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#1f2937}
      h1{font-size:18px;margin-bottom:4px}
      .meta{color:#6b7280;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left}
      th{background:#16a34a;color:#fff}
      tr:nth-child(even){background:#f9fafb}
    </style></head>
    <body>
      <h1>FarmERP Pro — ${title}</h1>
      <div class="meta">Generated ${new Date().toLocaleString()}</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=()=>{window.print()}</script>
    </body></html>`);
  win.document.close();
}

function valueToText(v) {
  if (v == null) return "";
  if (typeof v === "object" && v.props) return extractText(v);
  if (typeof v === "object") return "";
  return String(v);
}
