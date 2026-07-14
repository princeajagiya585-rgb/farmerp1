import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronDown, Check } from "lucide-react";

export function Card({ title, action, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 bg-white shadow-card transition-shadow hover:shadow-soft ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

const variants = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:scale-[.98]",
  secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:scale-[.98]",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[.98]",
  ghost: "text-gray-600 hover:bg-gray-100",
};

export function Button({ variant = "primary", className = "", children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const fieldBase =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export function Input({ label, className = "", ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1.5 block font-medium text-gray-600">{label}</span>}
      <input className={`${fieldBase} ${className}`} {...props} />
    </label>
  );
}

export function Select({ label, options = [], className = "", children, ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1.5 block font-medium text-gray-600">{label}</span>}
      <select className={`${fieldBase} ${className}`} {...props}>
        {children ||
          options.map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>
              {o.label ?? o}
            </option>
          ))}
      </select>
    </label>
  );
}

/**
 * Click-to-select multi-select dropdown.
 * props:
 *  - label
 *  - options: [{value, label}]
 *  - value: array of selected values
 *  - onChange: (nextArray) => void
 *  - placeholder, disabled
 */
export function MultiSelect({ label, options = [], value = [], onChange, placeholder = "Select…", disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = (value || []).map(String);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (val) => {
    const v = String(val);
    const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
    onChange(next);
  };

  const selectedOptions = options.filter((o) => selected.includes(String(o.value ?? o)));

  return (
    <div className="block text-sm" ref={ref}>
      {label && <span className="mb-1.5 block font-medium text-gray-600">{label}</span>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`${fieldBase} flex min-h-[44px] flex-wrap items-center gap-1.5 pr-9 text-left disabled:cursor-not-allowed disabled:bg-gray-50 ${open ? "border-brand-500 ring-2 ring-brand-500/20" : ""}`}
        >
          {selectedOptions.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : (
            selectedOptions.map((o) => (
              <span
                key={o.value ?? o}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
              >
                {o.label ?? o}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); toggle(o.value ?? o); }}
                  className="rounded-full p-0.5 hover:bg-brand-100"
                >
                  <X size={11} />
                </span>
              </span>
            ))
          )}
          <ChevronDown size={16} className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lift">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No options</p>
            ) : (
              options.map((o) => {
                const val = o.value ?? o;
                const isSel = selected.includes(String(val));
                return (
                  <button
                    type="button"
                    key={val}
                    onClick={() => toggle(val)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50"
                  >
                    <span className={isSel ? "font-medium text-brand-700" : "text-gray-700"}>{o.label ?? o}</span>
                    {isSel && <Check size={15} className="text-brand-600" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Textarea({ label, className = "", ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1.5 block font-medium text-gray-600">{label}</span>}
      <textarea className={`${fieldBase} ${className}`} {...props} />
    </label>
  );
}

const badgeColors = {
  green: "bg-green-100 text-green-700 ring-green-600/10",
  red: "bg-red-100 text-red-700 ring-red-600/10",
  yellow: "bg-amber-100 text-amber-700 ring-amber-600/10",
  blue: "bg-blue-100 text-blue-700 ring-blue-600/10",
  gray: "bg-gray-100 text-gray-600 ring-gray-500/10",
  purple: "bg-purple-100 text-purple-700 ring-purple-600/10",
};

export function Badge({ color = "gray", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeColors[color]}`}
    >
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className={`mt-4 sm:mt-12 w-full ${width} animate-fade-in rounded-2xl bg-white shadow-lift`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 sm:px-5 py-3.5">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Table({ columns, rows, empty = "No records found.", rowClassName, footerColumns = [], totalLabel = "Total", renderFooter, selectable = false, selectedIds, onToggleRow, onToggleAll, allSelected = false }) {
  const isSelected = (row) => (selectedIds ? selectedIds.has(row.id) : false);
  // Calculate totals for footer columns
  const calculateTotals = () => {
    const totals = {};
    footerColumns.forEach((colKey) => {
      totals[colKey] = rows.reduce((sum, row) => {
        const value = Number(row[colKey] || 0);
        return sum + value;
      }, 0);
    });
    return totals;
  };

  const totals = calculateTotals();

  const hasFooter = footerColumns.length > 0 && rows.length > 0;

  return (
    <>
    {/* Mobile (phones): each row becomes a stacked card so no column/data is
        lost — every field shows as a label → value pair. Desktop/tablet keep
        the normal table below. */}
    <div className="space-y-3 md:hidden">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-300">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17h6M9 13h6M9 9h2m4 0h-1M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H9l-4 4v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-400">{empty}</p>
        </div>
      ) : (
        <>
          {rows.map((row, i) => {
            const [first, ...rest] = columns;
            return (
              <div
                key={row.id ?? i}
                className={`rounded-xl border border-gray-100 bg-white p-4 shadow-card ${
                  rowClassName ? rowClassName(row) : ""
                }`}
              >
                {/* First column as the card title */}
                <div className="mb-2 flex items-center gap-2 border-b border-gray-100 pb-2 text-base font-semibold text-gray-800">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={isSelected(row)}
                      onChange={() => onToggleRow?.(row.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600"
                    />
                  )}
                  <span className="min-w-0 flex-1">{first.render ? first.render(row) : row[first.key] ?? "—"}</span>
                </div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2">
                  {rest.map((c) => (
                    <div key={c.key} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {c.header}
                      </dt>
                      <dd className="min-w-0 break-words text-right text-sm text-gray-800">
                        {c.render ? c.render(row) : row[c.key] ?? "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
          {renderFooter ? (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
              <table className="w-full text-sm">
                <tbody>{renderFooter({ totals, rows })}</tbody>
              </table>
            </div>
          ) : hasFooter && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
              <div className="mb-1.5 text-sm font-bold text-brand-700">{totalLabel}</div>
              <dl className="grid grid-cols-1 gap-y-1.5">
                {columns.filter((c) => footerColumns.includes(c.key)).map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.header}</dt>
                    <dd className="text-sm font-bold text-brand-700">
                      ₹{Number(totals[c.key] || 0).toLocaleString("en-IN")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      )}
    </div>

    {/* Desktop / tablet: original scrollable table, unchanged. */}
    <div className="hidden overflow-x-auto rounded-xl md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100/80 text-xs uppercase tracking-wider text-gray-500">
            {selectable && (
              <th className="w-10 rounded-tl-xl px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-brand-600"
                  title="Select all"
                />
              </th>
            )}
            {columns.map((c, i) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-4 py-3.5 font-semibold ${
                  i === 0 ? "rounded-tl-xl" : ""
                } ${
                  i === columns.length - 1 ? "rounded-tr-xl" : ""
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-300">
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17h6M9 13h6M9 9h2m4 0h-1M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H9l-4 4v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-400">{empty}</p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                style={{ animationDelay: `${i * 30}ms` }}
                className={`group animate-fade-in-row border-b border-gray-100 transition-all duration-150 hover:bg-brand-50/50 hover:shadow-[inset_3px_0_0_0_theme(colors.brand.400)] ${
                  rowClassName ? rowClassName(row) : ""
                }`}
              >
                {selectable && (
                  <td className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected(row)}
                      onChange={() => onToggleRow?.(row.id)}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-brand-600"
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-4 py-3 text-gray-700 group-hover:text-gray-900">
                    {c.render ? c.render(row) : row[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {renderFooter ? (
          <tfoot>{renderFooter({ totals, rows })}</tfoot>
        ) : footerColumns.length > 0 && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-brand-200 bg-gradient-to-r from-brand-50 to-brand-100/60 font-bold text-gray-800">
              {selectable && <td className="px-4 py-3" />}
              {columns.map((c, i) => (
                <td key={c.key} className={`px-4 py-3 ${
                  i === 0 ? "rounded-bl-xl" : ""
                } ${
                  i === columns.length - 1 ? "rounded-br-xl" : ""
                }`}>
                  {footerColumns.includes(c.key) ? (
                    <span className="text-brand-700">₹{Number(totals[c.key] || 0).toLocaleString("en-IN")}</span>
                  ) : (
                    c.key === columns[0].key ? <span className="text-brand-600">{totalLabel}</span> : null
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </>
  );
}

const statColors = {
  brand: "from-brand-500 to-brand-700",
  blue: "from-blue-500 to-blue-700",
  yellow: "from-amber-400 to-amber-600",
  red: "from-red-500 to-red-700",
  purple: "from-purple-500 to-purple-700",
  green: "from-emerald-500 to-emerald-700",
};

export function StatCard({ label, value, icon: Icon, color = "brand" }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
        </div>
        {Icon && (
          <div className={`rounded-xl bg-gradient-to-br p-3 text-white shadow-sm ${statColors[color] || statColors.brand}`}>
            <Icon size={22} />
          </div>
        )}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} />;
}

/* ── Toast notification ──────────────────────────────────────────────── */
const TOAST_COLORS = {
  success: "bg-green-600 text-white shadow-lg ring-1 ring-green-500/30",
  error: "bg-red-600 text-white shadow-lg ring-1 ring-red-500/30",
  info: "bg-brand-600 text-white shadow-lg ring-1 ring-brand-500/30",
};

function ToastInner({ message, type = "info", onClose }) {
  const icons = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
  };

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-xl animate-slide-in ${TOAST_COLORS[type] || TOAST_COLORS.info}`}
    >
      <span className="text-base">{icons[type] || icons.info}</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs leading-none hover:bg-white/30"
      >
        <X size={12} />
      </button>
    </div>
  );
}

let toastIdCounter = 0;

/**
 * A managed toast container that renders at the top of the page.
 *
 * Usage:
 * ```jsx
 * const [toasts, addToast] = useToast();
 * // ...
 * <ToastContainer toasts={toasts} onClose={(id) => removeToast(id)} />
 * // Call addToast("message", "success") anywhere
 * ```
 */
export function ToastContainer({ toasts = [], onClose }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[9999] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <ToastInner key={t.id} message={t.message} type={t.type} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}

/**
 * Hook: returns [toasts, addToast, removeToast]
 *
 * addToast(message, type = "info", durationMs = 3000)
 */
/**
 * Photo thumbnail with broken-image fallback. Reusable across pages.
 */
export function PhotoThumb({ url, alt = "Photo", noPhotoLabel = "—", size = 40, onClick }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400"
        style={{ width: size, height: size }}
      >
        {noPhotoLabel || "—"}
      </span>
    );
  }
  return (
    <div className="relative group">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="object-cover rounded-md cursor-pointer ring-1 ring-gray-200"
        style={{ width: size, height: size }}
        onClick={() => {
          if (onClick) onClick(url);
          else window.open(url, "_blank");
        }}
        onError={() => setFailed(true)}
      />
      <span
        className="hidden group-hover:flex absolute inset-0 items-center justify-center rounded-md bg-black/50 text-[10px] text-white cursor-pointer"
        onClick={() => {
          if (onClick) onClick(url);
          else window.open(url, "_blank");
        }}
      >
        View
      </span>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const addToast = useCallback((message, type = "info", durationMs = 3000) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, type }]);

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timersRef.current[id];
    }, durationMs);
    timersRef.current[id] = timer;

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return [toasts, addToast, removeToast];
}

