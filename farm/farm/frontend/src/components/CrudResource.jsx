import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Pencil, Trash2, Search, Download, Printer, ChevronLeft, ChevronRight, ChevronDown, Filter,
} from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import { resource } from "../lib/api";
import { formatApiError } from "../lib/errors";
import { exportExcel, printTable } from "../lib/export";
import { useAuth } from "../context/AuthContext";
import {
  Button, Card, Input, Modal, MultiSelect, PageHeader, Select, Table, Textarea,
} from "./ui";

/**
 * Config-driven CRUD page.
 * props:
 *  - title, subtitle
 *  - path: DRF resource path (e.g. "farms")
 *  - columns: [{key, header, render?}]
 *  - fields: [{name, label, type?(text|number|date|select|textarea|datetime-local), options?, required?, readonly?, hideInTable?}]
 *  - computedFields: [{ dependsOn: [fieldName], target: fieldName, compute: (form) => value }]
 *  - canWrite: bool
 *  - canEdit: bool
 *  - rowActions: (row, reload) => ReactNode
 *  - defaultValues: object
 *  - searchable: bool
 *  - showFarmFilter: bool — show farm dropdown filter
 *  - showEmployeeFilter: bool — show employee dropdown filter
 */
const EMPTY_PARAMS = {};

export default function CrudResource({
  title, subtitle, path, columns, fields = [], canWrite = true,
  canEdit,
  rowActions, defaultValues = {}, searchable = true, extraToolbar, listParams = EMPTY_PARAMS,
  refreshInterval, computedFields = [], rowClassName, sortRows, createOptions, footerColumns = [],
  fieldDependencies = [], // [{ watch: "fieldName", target: "targetField", mapField: "sourceFieldInRecord" }]
  renderFooter, // optional custom tfoot footer: (totals) => JSX
  hideExport, // hide the default Excel/Print buttons
  hideDateFilter, // hide the date-range filter
  showFarmFilter, // show farm dropdown filter
  showEmployeeFilter, // show employee dropdown filter
}) {
  const { t, i18n } = useTranslation();
  const { hasRole, user } = useAuth();
  const isEmployee = user?.role === "EMPLOYEE";
  const canModify = canEdit !== undefined ? canEdit : canWrite;
  // Only super admins may delete — managers can create/edit but never delete.
  const canDelete = hasRole("SUPER_ADMIN");
  const repo = resource(path);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selMonth, setSelMonth] = useState("");
  const [selYear, setSelYear] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const PAGE_SIZE = 25;
  // Farm/Employee filter state
  const [farmFilter, setFarmFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [appliedFarmFilter, setAppliedFarmFilter] = useState("");
  const [appliedEmpFilter, setAppliedEmpFilter] = useState("");
  const [farms, setFarms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fkOptions, setFkOptions] = useState({});
  const [fkData, setFkData] = useState({}); // stores full records { fieldName: { id: record } }
  const [currentRow, setCurrentRow] = useState(null);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);

  // Load options for FK select fields
  useEffect(() => {
    fields
      .filter((f) => f.optionsFrom)
      .forEach(async (f) => {
        try {
          const data = await resource(f.optionsFrom.path).list({ page_size: 200 });
          const items = Array.isArray(data) ? data : data.results || [];
          setFkOptions((prev) => ({
            ...prev,
            [f.name]: items.map((it) => ({
              value: it.id,
              label: f.optionsFrom.label(it),
            })),
          }));
          setFkData((prev) => ({
            ...prev,
            [f.name]: Object.fromEntries(items.map((it) => [it.id, it])),
          }));
        } catch {
          /* ignore */
        }
      });
    // FK option lists only depend on the resource path; `fields` is an inline
    // array literal that changes identity every render, so depending on it
    // would refetch all option lists on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Load farms/employees for filters
  useEffect(() => {
    if (showFarmFilter && !isEmployee) {
      resource("farms").list({ page_size: 200 }).then((d) => setFarms(d.results || d)).catch(() => {});
    }
    if (showEmployeeFilter && !isEmployee) {
      resource("workforce/employees").list({ page_size: 200 }).then((d) => setEmployees(d.results || d)).catch(() => {});
    }
  }, [showFarmFilter, showEmployeeFilter, isEmployee]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, ...listParams };
      if (search) params.search = search;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (appliedFarmFilter && !isEmployee) params.farm = appliedFarmFilter;
      if (appliedEmpFilter && !isEmployee) params.employee = appliedEmpFilter;
      const data = await repo.list(params);
      if (Array.isArray(data)) {
        setRows(data);
        setCount(data.length);
        setHasNext(false);
      } else {
        setRows(data.results || []);
        setCount(data.count ?? (data.results || []).length);
        setHasNext(Boolean(data.next));
      }
    } catch (e) {
      setError(e.response?.data?.detail || t("crud.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [path, search, page, dateFrom, dateTo, appliedFarmFilter, appliedEmpFilter, listParams, isEmployee, t]);

  // Auto-refresh interval
  const intervalRef = useRef(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    load();
    if (refreshInterval && refreshInterval > 0) {
      setLive(true);
      intervalRef.current = setInterval(() => {
        load();
        setLive(true);
        setTimeout(() => setLive(false), 1000);
      }, refreshInterval * 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // reset to page 1 when search or date filter changes
  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo]);

  // Date range via selectable month / year dropdowns
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i, 1).toLocaleString(i18n.language, { month: "short" }),
  }));
  const YEARS = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i);

  const applyPeriod = (month, year) => {
    setSelMonth(month);
    setSelYear(year);
    if (year && month) {
      const y = Number(year), m = Number(month);
      setDateFrom(fmtDate(new Date(y, m - 1, 1)));
      setDateTo(fmtDate(new Date(y, m, 0)));
    } else if (year) {
      setDateFrom(`${year}-01-01`);
      setDateTo(`${year}-12-31`);
    } else if (month) {
      const y = new Date().getFullYear(), m = Number(month);
      setDateFrom(fmtDate(new Date(y, m - 1, 1)));
      setDateTo(fmtDate(new Date(y, m, 0)));
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };
  const clearDates = () => { setDateFrom(""); setDateTo(""); setSelMonth(""); setSelYear(""); };

  const openCreate = () => {
    const initialForm = { ...defaultValues };
    fields.forEach((fl) => {
      if (fl.type === "multiselect" && !Array.isArray(initialForm[fl.name])) {
        initialForm[fl.name] = [];
      }
    });
    setForm(initialForm);
    setError("");
    setCurrentRow(null);
    setModal({ mode: "create" });
  };
  const openEdit = (row) => {
    const f = {};
    fields.forEach((fl) => {
      if (fl.type === "multiselect") {
        f[fl.name] = row[fl.name]?.map((item) => (typeof item === 'object' && item?.id ? item.id : item)) ?? [];
      } else if (fl.type === "coords") {
        const lat = row[fl.targets?.[0]] ?? "";
        const lng = row[fl.targets?.[1]] ?? "";
        f[fl.name] = lat && lng ? `${lat}, ${lng}` : "";
        if (fl.targets?.[0]) f[fl.targets[0]] = lat;
        if (fl.targets?.[1]) f[fl.targets[1]] = lng;
      } else {
        f[fl.name] = row[fl.name] ?? "";
      }
    });
    setForm(f);
    setError("");
    setCurrentRow(row);
    setModal({ mode: "edit", id: row.id });
  };

  const hasFileField = fields.some((f) => f.type === "file");

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      let payload = { ...form };
      // Remove virtual coords field, keep the split targets
      fields.forEach((fl) => {
        if (fl.type === "coords") delete payload[fl.name];
      });
      fields.forEach((fl) => {
        if (fl.type === "number" && payload[fl.name] !== "" && payload[fl.name] != null)
          payload[fl.name] = Number(payload[fl.name]);
        if (fl.type === "multiselect") {
          if (!Array.isArray(payload[fl.name]))
            payload[fl.name] = [];
          // Keep original values as-is (supports both integer and UUID primary keys)
        }
      });

      if (hasFileField) {
        const fd = new FormData();
        fields.forEach((fl) => {
          const val = payload[fl.name];
          if (val instanceof File) {
            fd.append(fl.name, val, val.name);
          } else if (fl.type !== "file" && val !== "" && val != null) {
            if (fl.type === "multiselect" && Array.isArray(val)) {
              val.forEach((v) => {
                if (v) fd.append(fl.name, String(v));
              });
            } else {
              fd.append(fl.name, String(val));
            }
          }
        });
        payload = fd;
      } else {
        fields.forEach((fl) => {
          if (payload[fl.name] === "") payload[fl.name] = null;
        });
      }

      if (modal.mode === "create") {
        await repo.create(payload);
      } else {
        if (!hasFileField) {
          Object.keys(payload).forEach((k) => {
            if (payload[k] === null || payload[k] === "") delete payload[k];
          });
        }
        await repo.update(modal.id, payload);
      }
      setModal(null);
      load();
    } catch (e) {
      setError(formatApiError(e, t("crud.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const del = async (row) => {
    if (!confirm(t("crud.confirmDelete"))) return;
    try {
      await repo.remove(row.id);
      load();
    } catch (e) {
      setError(formatApiError(e, t("crud.saveFailed")));
    }
  };

  // Build a total row object from footer column sums
  const buildTotalRow = (dataRows, footerCols) => {
    const totals = {};
    footerCols.forEach((colKey) => {
      totals[colKey] = dataRows.reduce((sum, row) => sum + (Number(row[colKey] || 0)), 0);
    });
    const row = { [columns[0]?.key]: t("common.total") };
    columns.forEach((c) => {
      if (c.key !== columns[0]?.key) row[c.key] = "";
    });
    return { ...row, ...totals };
  };

  // Fetch ALL rows for Excel export (respects all filters)
  const exportAll = async () => {
    let allRows = rows;
    try {
      const params = { page_size: 10000, ...listParams };
      if (search) params.search = search;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (appliedFarmFilter && !isEmployee) params.farm = appliedFarmFilter;
      if (appliedEmpFilter && !isEmployee) params.employee = appliedEmpFilter;
      const data = await repo.list(params);
      allRows = Array.isArray(data) ? data : data.results || [];
    } catch {
      // fall back to current page rows
    }
    const exportRows = footerColumns.length > 0 && allRows.length > 0
      ? [...allRows, buildTotalRow(allRows, footerColumns)]
      : allRows;
    exportExcel(exportRows, columns, `${path.replace(/\//g, "-")}.xlsx`, title);
  };

  const allColumns = [
    ...columns,
    ...(canWrite || rowActions
      ? [
          {
            key: "_actions",
            header: t("common.actions"),
            render: (row) => (
              <div className="flex items-center gap-1">
                {rowActions && rowActions(row, load)}
                {canModify && (
                  <button onClick={() => openEdit(row)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title={t("common.edit")}>
                    <Pencil size={15} />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => del(row)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title={t("common.delete")}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          canWrite && (
            createOptions ? (
              <div className="relative">
                <Button onClick={() => setShowCreateDropdown(!showCreateDropdown)}>
                  <Plus size={16} /> {t("crud.new")} <ChevronDown size={14} />
                </Button>
                {showCreateDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowCreateDropdown(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lift">
                      {createOptions.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => {
                            const initialForm = { ...defaultValues, ...(opt.values || {}) };
                            fields.forEach((fl) => {
                              if (fl.type === "multiselect" && !Array.isArray(initialForm[fl.name])) {
                                initialForm[fl.name] = [];
                              }
                            });
                            setForm(initialForm);
                            setError("");
                            setCurrentRow(null);
                            setModal({ mode: "create" });
                            setShowCreateDropdown(false);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700"
                        >
                          <Plus size={15} className="text-gray-400" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Button onClick={openCreate}>
                <Plus size={16} /> {t("crud.new")}
              </Button>
            )
          )
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {searchable && (
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("crud.search")}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
              />
            </div>
          )}
          {!hideDateFilter && (
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title={t("crud.fromDate")}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
              />
              <span className="text-xs text-gray-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title={t("crud.toDate")}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
              />
              <select
                value={selMonth}
                onChange={(e) => applyPeriod(e.target.value, selYear)}
                title={t("header.month")}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-brand-500"
              >
                <option value="">{t("header.month")}</option>
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select
                value={selYear}
                onChange={(e) => applyPeriod(selMonth, e.target.value)}
                title={t("header.year")}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-brand-500"
              >
                <option value="">{t("header.year")}</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {(dateFrom || dateTo) && (
                <button onClick={clearDates} className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
                  {t("crud.clearDates")}
                </button>
              )}
            </div>
          )}
          {/* Farm & Employee Filters with Apply button */}
          {(showFarmFilter || showEmployeeFilter) && !isEmployee && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-2 border border-gray-200">
              {showFarmFilter && (
                <div className="min-w-[150px]">
                  <select
                    value={farmFilter}
                    onChange={(e) => setFarmFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">{t("workforce.allFarms")}</option>
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {showEmployeeFilter && (
                <div className="min-w-[150px]">
                  <select
                    value={empFilter}
                    onChange={(e) => setEmpFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">{t("common.allEmployees")}</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={() => { setAppliedFarmFilter(farmFilter); setAppliedEmpFilter(empFilter); setPage(1); }}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                <Filter size={13} /> {t("common.applyFilters")}
              </button>
              {(appliedFarmFilter || appliedEmpFilter) && (
                <button
                  onClick={() => { setFarmFilter(""); setEmpFilter(""); setAppliedFarmFilter(""); setAppliedEmpFilter(""); setPage(1); }}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
                >
                  {t("common.reset")}
                </button>
              )}
            </div>
          )}
          {extraToolbar}
          <div className="flex items-center gap-3 ml-auto">
            {refreshInterval && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                      live ? "bg-green-400" : "bg-gray-300"
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      live ? "bg-green-500" : "bg-gray-400"
                    }`}
                  />
                </span>
                {live ? t("common.live") : `${refreshInterval}s`}
              </span>
            )}
            {!hideExport && (
              <div className="flex gap-2">
                <Button variant="secondary" disabled={loading} onClick={exportAll}>
                  <Download size={15} /> {t("crud.excel")}
                </Button>
                <Button variant="secondary" disabled={loading} onClick={() => printTable(title, rows, columns)}>
                  <Printer size={15} /> {t("crud.print")}
                </Button>
              </div>
            )}
          </div>
        </div>

        {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        {loading ? (
          <div className="py-4">
            <LoadingSpinner fullScreen={false} size="md" message={t("crud.loading")} />
          </div>
        ) : (
          <Table
            columns={allColumns}
            rows={sortRows ? [...rows].sort(sortRows) : rows}
            rowClassName={rowClassName}
            footerColumns={footerColumns}
            totalLabel={t("common.total")}
            renderFooter={renderFooter}
          />
        )}

        {(count > PAGE_SIZE || page > 1) && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>
              {count} {count === 1 ? t("crud.record") : t("crud.records")} · {t("crud.page")} {page}
              {count > 0 ? ` ${t("crud.of")} ${Math.max(1, Math.ceil(count / PAGE_SIZE))}` : ""}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center rounded-lg border border-gray-300 px-2 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={16} /> {t("crud.prev")}
              </button>
              <button
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center rounded-lg border border-gray-300 px-2 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                {t("crud.next")} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "create" ? t("crud.newTitle", { title }) : t("crud.editTitle", { title })}
      >
        <form onSubmit={save} className="space-y-3">
          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
          {fields.map((fl) => {
            const isReadonly = typeof fl.readonly === "function" ? fl.readonly(currentRow, modal?.mode) : fl.readonly;
            const handleChange = (e) => {
              const newValue = e.target.value;
              let updates = { ...form, [fl.name]: newValue };
              // Auto-fill dependent fields from FK record data
              fieldDependencies.forEach((dep) => {
                if (dep.watch === fl.name && newValue) {
                  const record = fkData[dep.watch]?.[newValue];
                  if (record && dep.mapField) {
                    updates[dep.target] = record[dep.mapField];
                  }
                }
              });
              computedFields.forEach((cf) => {
                if (cf.dependsOn.includes(fl.name)) {
                  updates[cf.target] = cf.compute(updates);
                }
              });
              setForm(updates);
            };
            const common = {
              value: form[fl.name] != null ? String(form[fl.name]) : "",
              onChange: handleChange,
              required: fl.required,
              disabled: isReadonly,
            };
            if (isReadonly) {
              return (
                <div key={fl.name}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{fl.label}</label>
                  <div className="flex h-10 items-center rounded-xl border border-gray-200 bg-gray-50 px-3.5 text-sm font-semibold text-gray-900">
                    {fl.type === "number"
                      ? `₹${Number(form[fl.name] || 0).toLocaleString("en-IN")}`
                      : form[fl.name] || t("crud.readonlyDisplay")}
                  </div>
                </div>
              );
            }
            if (fl.type !== "multiselect" && (fl.type === "select" || fl.optionsFrom)) {
              const opts = fl.optionsFrom ? fkOptions[fl.name] || [] : fl.options;
              return (
                <Select key={fl.name} label={fl.label} {...common}>
                  <option value="">{t("crud.noOptions")}</option>
                  {opts.map((o) => (
                    <option key={o.value ?? o} value={o.value ?? o}>
                      {o.label ?? o}
                    </option>
                  ))}
                </Select>
              );
            }
            if (fl.type === "multiselect") {
              const opts = fl.optionsFrom ? fkOptions[fl.name] || [] : fl.options || [];
              const selected = Array.isArray(form[fl.name]) ? form[fl.name] : [];
              return (
                <MultiSelect
                  key={fl.name}
                  label={fl.label}
                  options={opts}
                  value={selected}
                  disabled={isReadonly}
                  placeholder={t("crud.noOptions")}
                  onChange={(next) => setForm({ ...form, [fl.name]: next })}
                />
              );
            }
            if (fl.type === "file")
              return (
                <div key={fl.name}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{fl.label}</label>
                  <input
                    type="file"
                    accept={t("crud.fileAccept")}
                    onChange={(e) =>
                      setForm({ ...form, [fl.name]: e.target.files[0] || "" })
                    }
                    className="w-full rounded-lg border border-gray-300 text-sm file:mr-3 file:rounded-l-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
                  />
                  {form[fl.name] && form[fl.name] instanceof File && (
                    <p className="mt-1 text-xs text-gray-500">{t("crud.fileHint", { name: form[fl.name].name })}</p>
                  )}
                </div>
              );
            if (fl.type === "coords") {
              const coordVal = form[fl.name] ||
                (form[fl.targets?.[0]] && form[fl.targets?.[1]]
                  ? `${form[fl.targets[0]]}, ${form[fl.targets[1]]}`
                  : "");
              return (
                <div key={fl.name}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{fl.label}</label>
                  <input
                    type="text"
                    placeholder={fl.placeholder || "lat, lng"}
                    value={coordVal}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parts = raw.split(",").map((p) => p.trim());
                      const updates = { ...form, [fl.name]: raw };
                      if (fl.targets?.[0]) updates[fl.targets[0]] = parts[0] || "";
                      if (fl.targets?.[1]) updates[fl.targets[1]] = parts[1] || "";
                      setForm(updates);
                    }}
                    className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <p className="mt-1 text-xs text-gray-400">Enter as: latitude, longitude (e.g. 28.6139, 77.2090)</p>
                </div>
              );
            }
            if (fl.type === "textarea")
              return <Textarea key={fl.name} label={fl.label} rows={3} {...common} />;
            return (
              <Input key={fl.name} label={fl.label} type={fl.type || "text"} {...common} />
            );
          })}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>
              {t("crud.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("crud.saving") : t("crud.save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
