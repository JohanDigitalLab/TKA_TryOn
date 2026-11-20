"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AdminSidebar from "@/components/admin/admin-sidebar";

const PAGE_SIZE = 25;

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";
const labelClass = "block text-sm font-semibold text-slate-800";
const buttonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-60";

function renderCell(row, column) {
  const value = row[column.key];
  if (column.render) return column.render(value, row);
  if (typeof value === "boolean") return value ? "✓" : "–";
  if (value === null || value === undefined || value === "") return "–";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function emptyValues(fields, row) {
  const values = {};
  for (const field of fields) {
    const raw = row ? row[field.name] : field.default ?? "";
    values[field.name] =
      field.type === "boolean" ? Boolean(raw ?? false) : raw ?? "";
  }
  return values;
}

/**
 * Workspace CRUD generik untuk satu tabel master data.
 * props: table, title, description, columns, fields, searchPlaceholder,
 * createLabel, hideIdOnEdit (tabel PK teks).
 */
export default function MasterDataWorkspace({
  table,
  title,
  description,
  columns,
  fields,
  searchPlaceholder = "Cari…",
  createLabel = "Tambah Data",
}) {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null); // { mode, row }
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Debounce pencarian tanpa setState sinkron di body effect.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      await Promise.resolve();
      if (active) {
        setDebouncedSearch(search.trim());
        setOffset(0);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        await Promise.resolve();
        const { data, error: rpcError } = await supabase.rpc("admin_master_list", {
          p_table: table,
          p_search: debouncedSearch || null,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        });
        if (!active) return;
        if (rpcError) {
          if (rpcError.code === "PGRST202")
            throw new Error(
              "RPC admin_master_list belum tersedia. Jalankan migration-admin-master-data.sql di Supabase SQL Editor.",
            );
          throw rpcError;
        }
        setRows(Array.isArray(data?.rows) ? data.rows : []);
        setTotal(Number(data?.total ?? 0));
        setError("");
      } catch (err) {
        if (active) {
          setError(err.message || "Data master gagal dimuat.");
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [table, debouncedSearch, offset, reloadToken]);

  function openCreate() {
    setValues(emptyValues(fields, null));
    setFormError("");
    setModal({ mode: "create" });
  }

  function openEdit(row) {
    setValues(emptyValues(fields, row));
    setFormError("");
    setModal({ mode: "edit", row });
  }

  function updateField(name) {
    return (event) => {
      const input = event.target;
      setFormError("");
      setValues((previous) => ({
        ...previous,
        [name]: input.type === "checkbox" ? input.checked : input.value,
      }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;

    const payload = {};
    for (const field of fields) {
      if (field.pkText && modal.mode === "edit") continue; // id tidak diubah
      let value = values[field.name];
      if (field.type === "boolean") {
        payload[field.name] = Boolean(value);
        continue;
      }
      if (typeof value === "string") value = value.trim();
      if (field.required && (value === "" || value === null || value === undefined)) {
        setFormError(`${field.label} wajib diisi.`);
        return;
      }
      if (field.type === "number") {
        payload[field.name] = value === "" ? null : Number(value);
        continue;
      }
      payload[field.name] = value === "" ? null : value;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc("admin_master_save", {
        p_table: table,
        p_id: modal.mode === "edit" ? String(modal.row.id) : null,
        p_data: payload,
      });
      if (rpcError) throw rpcError;
      setModal(null);
      setNotice(
        modal.mode === "edit" ? "Data berhasil diperbarui." : "Data berhasil ditambahkan.",
      );
      setReloadToken((token) => token + 1);
    } catch (err) {
      setFormError(err.message || "Gagal menyimpan data.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(row) {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("admin_master_delete", {
        p_table: table,
        p_id: String(row.id),
      });
      if (rpcError) throw rpcError;
      setNotice("Data berhasil dihapus.");
      setPendingDelete(null);
      setReloadToken((token) => token + 1);
    } catch (err) {
      setError(err.message || "Gagal menghapus data.");
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  const heading = useMemo(() => title, [title]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 lg:flex">
      <AdminSidebar active={`Master: ${heading}`} />

      <main className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div>
            <p className="text-xs text-slate-400">ADMINISTRATION / MASTER DATA / {heading.toUpperCase()}</p>
            <h2 className="mt-1 text-xl font-bold">{heading}</h2>
          </div>
          <Link
            href="/admin"
            className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            ← Dashboard
          </Link>
        </header>

        <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
          <p className="text-sm text-slate-600">{description}</p>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && !error && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {notice}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex-1 min-w-56 text-sm font-semibold text-slate-700" htmlFor="master-search">
              <input
                id="master-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <button
              type="button"
              onClick={openCreate}
              className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}
            >
              + {createLabel}
            </button>
            <button
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
              className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              Muat ulang
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-3">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-10 text-center font-semibold text-slate-500">
                      Memuat data…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-500">
                      Tidak ada data.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      {columns.map((column) => (
                        <td key={column.key} className="px-4 py-3 align-top text-slate-700">
                          {renderCell(row, column)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            Ubah
                          </button>
                          {pendingDelete === row.id ? (
                            <>
                              <button
                                type="button"
                                disabled={deleting}
                                onClick={() => confirmDelete(row)}
                                className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-60"
                              >
                                {deleting ? "Menghapus…" : "Ya, hapus"}
                              </button>
                              <button
                                type="button"
                                disabled={deleting}
                                onClick={() => setPendingDelete(null)}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                              >
                                Batal
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingDelete(row.id)}
                              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <nav
            aria-label={`Paging ${heading}`}
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <span className="text-slate-600">
              {total > 0
                ? `Menampilkan ${rangeStart}–${rangeEnd} dari ${total} data · ${PAGE_SIZE} baris per halaman`
                : "Tidak ada data"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Halaman sebelumnya"
                disabled={currentPage <= 1}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <span className="font-semibold text-slate-700">
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                type="button"
                aria-label="Halaman berikutnya"
                disabled={currentPage >= totalPages}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40"
              >
                Berikutnya →
              </button>
            </div>
          </nav>
        </div>
      </main>

      {modal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="master-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setModal(null);
          }}
        >
          <section className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setModal(null)}
              disabled={saving}
              aria-label="Tutup formulir"
              className="absolute right-4 top-4 text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-50"
            >
              ×
            </button>
            <h3 id="master-modal-title" className="text-xl font-extrabold text-slate-950">
              {modal.mode === "edit" ? `Ubah ${heading}` : createLabel}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Tabel <code className="rounded bg-slate-100 px-1">{table}</code>. Kolom bertanda * wajib diisi.
            </p>

            {formError && (
              <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {formError}
              </div>
            )}

            <form onSubmit={submit} aria-busy={saving} className="mt-5 space-y-4">
              <fieldset disabled={saving} className="space-y-4">
                {modal.mode === "edit" && (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    ID: <code>{String(modal.row.id)}</code>
                  </p>
                )}
                {fields.map((field) => {
                  if (field.pkText && modal.mode === "edit") return null;
                  if (field.type === "boolean") {
                    return (
                      <label key={field.name} className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          name={field.name}
                          checked={Boolean(values[field.name])}
                          onChange={updateField(field.name)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {field.label}
                      </label>
                    );
                  }
                  return (
                    <label key={field.name} className={labelClass} htmlFor={`master-${field.name}`}>
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-600">*</span>}
                      {field.type === "select" ? (
                        <select
                          id={`master-${field.name}`}
                          name={field.name}
                          value={values[field.name] ?? ""}
                          onChange={updateField(field.name)}
                          className={inputClass}
                        >
                          <option value="">— pilih —</option>
                          {(field.options || []).map((option) => (
                            <option key={String(option.value)} value={String(option.value)}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "textarea" ? (
                        <textarea
                          id={`master-${field.name}`}
                          name={field.name}
                          rows={3}
                          value={values[field.name] ?? ""}
                          onChange={updateField(field.name)}
                          placeholder={field.placeholder}
                          className={inputClass}
                        />
                      ) : (
                        <input
                          id={`master-${field.name}`}
                          name={field.name}
                          type={field.type === "number" ? "number" : "text"}
                          value={values[field.name] ?? ""}
                          onChange={updateField(field.name)}
                          placeholder={field.placeholder}
                          maxLength={field.maxLength}
                          className={inputClass}
                        />
                      )}
                      {field.hint && (
                        <span className="mt-1 block text-xs font-normal text-slate-500">{field.hint}</span>
                      )}
                    </label>
                  );
                })}

                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={saving}
                    className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}
                  >
                    {saving ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
