"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PortalHeader from "@/components/portal-header";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import { fetchProvinces } from "@/lib/indonesia/provinces.mjs";
import { supabase } from "@/lib/supabase";

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-sm font-semibold text-slate-800";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-60";

function Field({
  label,
  name,
  hint,
  required = false,
  as = "input",
  options,
  ...props
}) {
  return (
    <label className={labelClass} htmlFor={name}>
      {label}
      {required ? <span className="ml-1 text-rose-600">*</span> : null}
      {as === "select" ? (
        <select id={name} name={name} className={inputClass} {...props}>
          {options}
        </select>
      ) : as === "textarea" ? (
        <textarea
          id={name}
          name={name}
          rows={3}
          className={inputClass}
          {...props}
        />
      ) : (
        <input id={name} name={name} className={inputClass} {...props} />
      )}
      {hint ? (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function SchoolProfileContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedSchool =
    params.get("schoolId") || params.get("school_id") || "";

  const [role, setRole] = useState(null);
  const [viewerName, setViewerName] = useState("Sekolah");
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    name: "",
    npsn: "",
    school_type_id: "",
    address: "",
    city: "",
    province: "",
  });
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutating, setMutating] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const lock = useRef(false);

  const schoolId = requestedSchool;
  const [reloadToken, setReloadToken] = useState(0);
  const [provinces, setProvinces] = useState([]);
  const [provinceSource, setProvinceSource] = useState("remote");

  useEffect(() => {
    let active = true;

    async function loadProvinces() {
      // await lebih dulu agar tidak ada setState sinkron di body effect.
      const list = await fetchProvinces();
      if (!active) return;
      setProvinces(list);
      setProvinceSource(list.length >= 34 ? "remote" : "fallback");
    }

    void loadProvinces();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSchool() {
      let denied = false;
      try {
        await Promise.resolve();
        if (!active) return;
        setLoading(true);
        setError("");

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getUser();
        if (sessionError) throw sessionError;
        if (!sessionData?.user) {
          denied = true;
          setRedirecting(true);
          router.replace("/");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, account_type, school_id")
          .eq("id", sessionData.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!active) return;

        const accountType = String(profile?.account_type || "").toUpperCase();
        if (accountType !== "SCHOOL" && accountType !== "ADMIN") {
          denied = true;
          setRedirecting(true);
          router.replace("/home");
          return;
        }

        setRole(accountType);
        setViewerName(
          profile?.full_name || (accountType === "ADMIN" ? "Admin" : "Sekolah"),
        );

        const { data: payload, error: rpcError } = await supabase.rpc(
          "get_school_profile",
          {
            p_school_id: accountType === "ADMIN" ? schoolId || null : null,
          },
        );
        if (rpcError) {
          if (rpcError.code === "PGRST202")
            throw new Error(
              "RPC get_school_profile belum tersedia. Jalankan migration-school-profile-operator.sql di Supabase SQL Editor.",
            );
          throw rpcError;
        }
        if (!active) return;

        setData(payload || null);
        const school = payload?.school || {};
        setForm({
          name: school.name || "",
          npsn: school.npsn || "",
          school_type_id: school.school_type_id || "",
          address: school.address || "",
          city: school.city || "",
          province: school.province || "",
        });
        setError("");
      } catch (err) {
        if (active && !denied)
          setError(err.message || "Data sekolah belum berhasil dimuat.");
      } finally {
        if (active && !denied) setLoading(false);
      }
    }

    void loadSchool();
    return () => {
      active = false;
    };
  }, [router, schoolId, reloadToken]);

  function update(name) {
    return (event) => {
      setNotice("");
      setForm((previous) => ({ ...previous, [name]: event.target.value }));
    };
  }

  async function saveSchool(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc("update_school_profile", {
        p_school_id: role === "ADMIN" ? data?.school?.id || null : null,
        p_name: form.name.trim(),
        p_npsn: form.npsn.trim() || null,
        p_school_type_id: form.school_type_id || null,
        p_address: form.address.trim(),
        p_city: form.city.trim(),
        p_province: form.province.trim(),
      });
      if (rpcError) throw rpcError;
      setReloadToken((value) => value + 1);
      setNotice("Data sekolah berhasil diperbarui.");
    } catch (err) {
      setError(err.message || "Data sekolah belum berhasil disimpan.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  async function toggleOperator(userId, assign) {
    if (lock.current) return;
    lock.current = true;
    setMutating(`${userId}:${assign ? "add" : "remove"}`);
    setError("");
    setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc("set_school_operator", {
        p_user_id: userId,
        p_assign: assign,
        p_school_id: role === "ADMIN" ? data?.school?.id || null : null,
      });
      if (rpcError) throw rpcError;
      setReloadToken((value) => value + 1);
      setNotice(
        assign
          ? "Operator berhasil ditambahkan."
          : "Operator berhasil dilepas dari sekolah.",
      );
      setPendingRemoval(null);
      if (assign) setAdding(false);
    } catch (err) {
      setError(err.message || "Perubahan operator belum berhasil disimpan.");
    } finally {
      lock.current = false;
      setMutating("");
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
  }

  // Daftar operator hanya akun SCHOOL (filter defensif bila RPC lama masih terpasang).
  const operators = useMemo(
    () =>
      (Array.isArray(data?.operators) ? data.operators : []).filter(
        (operator) => String(operator.account_type || "").toUpperCase() === "SCHOOL",
      ),
    [data],
  );
  const candidates = useMemo(
    () => (Array.isArray(data?.candidates) ? data.candidates : []),
    [data],
  );
  // Urutkan tipe sekolah menurut grade jenjang (defensif terhadap RPC lama).
  const schoolTypes = useMemo(() => {
    const list = Array.isArray(data?.school_types) ? data.school_types : [];
    const gradeOf = (type) => {
      const value = Number(type?.grade);
      return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
    };
    return [...list].sort(
      (a, b) => gradeOf(a) - gradeOf(b) || String(a.name || "").localeCompare(String(b.name || "")),
    );
  }, [data]);
  // Nilai tersimpan tetap dapat dipilih walau ejaannya berbeda dari sumber data.
  const provinceOptions = useMemo(() => {
    const merged = [...provinces];
    const current = form.province.trim();
    if (
      current &&
      !merged.some((name) => name.toLowerCase() === current.toLowerCase())
    )
      merged.unshift(current);
    return merged;
  }, [provinces, form.province]);
  const missingSchoolLink = role === "SCHOOL" && !data?.school;

  if (redirecting) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">
          Mengalihkan…
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">
          Memuat data sekolah…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <PortalHeader
        displayName={viewerName}
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />

      <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <DashboardBreadcrumb current="Profil Sekolah" />
        <section id="greeting" className="mb-10 scroll-mt-28">
          <div className="mb-5">
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Profil Sekolah
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {role === "ADMIN"
                ? "Kamu masuk sebagai admin. "
                : "Perbarui identitas dan alamat sekolah kamu."}
              {data?.school?.id ? ` · ID sekolah ${data.school.id}` : ""}
            </p>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="mt-3 block rounded-lg border border-red-300 px-4 py-2 font-bold hover:bg-red-100"
            >
              Coba muat ulang
            </button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
          >
            {notice}
          </div>
        )}

        {missingSchoolLink ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <h2 className="text-lg font-extrabold">
              Belum ada sekolah terhubung
            </h2>
            <p className="mt-2 text-sm leading-6">
              Kamu belum terdaftar untuk menjadi admin sekolah manapun. Minta
              admin yang sekarang untuk mendaftarkan akunmu sebagai admin
              sekolah.
            </p>
          </div>
        ) : (
          <>
            {role === "ADMIN" && !data?.school ? (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                Belum ada sekolah yang dipilih. Buka halaman dengan parameter
                sekolah, misalnya{" "}
                <code className="font-mono text-xs">
                  {"/school/profile?schoolId=<uuid>"}
                </code>
                .
              </div>
            ) : null}

            <section id="students" className="mb-10 scroll-mt-28">
              <form
                onSubmit={saveSchool}
                aria-busy={saving}
                className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <fieldset disabled={saving} className="space-y-5">
                  <Field
                    label="Nama sekolah"
                    name="name"
                    value={form.name}
                    onChange={update("name")}
                    minLength={3}
                    maxLength={160}
                    required
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="NPSN"
                      name="npsn"
                      value={form.npsn}
                      onChange={update("npsn")}
                      inputMode="numeric"
                      maxLength={8}
                      hint="Tepat 8 digit angka."
                    />
                    <Field
                      label="Tipe sekolah"
                      name="school_type_id"
                      as="select"
                      value={form.school_type_id}
                      onChange={update("school_type_id")}
                      options={
                        <>
                          <option value="">Pilih tipe…</option>
                          {schoolTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.education_level_id
                                ? `${String(type.education_level_id).toUpperCase()} · `
                                : ""}
                              {type.name}
                              {type.grade ? ` · kelas ${type.grade}` : ""}
                            </option>
                          ))}
                        </>
                      }
                      hint="Menentukan mata pelajaran yang tersedia."
                    />
                  </div>
                  <Field
                    label="Alamat"
                    name="address"
                    as="textarea"
                    value={form.address}
                    onChange={update("address")}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Kota / kabupaten"
                      name="city"
                      value={form.city}
                      onChange={update("city")}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                    <Field
                      label="Provinsi"
                      name="province"
                      as="select"
                      value={form.province}
                      onChange={update("province")}
                      required
                      options={
                        <>
                          <option value="">Pilih provinsi…</option>
                          {provinceOptions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </>
                      }
                      hint={
                        provinceSource === "remote"
                          ? `${provinceOptions.length} provinsi, sumber data wilayah Indonesia.`
                          : "Daftar jaringan tidak tersedia; memakai daftar standar 38 provinsi."
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    className={`${buttonClass} w-full bg-blue-700 text-white hover:bg-blue-800`}
                  >
                    {saving ? "Menyimpan…" : "Simpan Data Sekolah"}
                  </button>
                </fieldset>
              </form>
            </section>

            <section id="operators" className="mb-8 scroll-mt-28">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">
                    Pengelola Akun Sekolah
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAdding((value) => !value);
                    setPendingRemoval(null);
                  }}
                  className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}
                >
                  {adding ? "Tutup" : "Tambah"}
                </button>
              </div>

              {adding ? (
                <div className="mb-5 mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-bold text-blue-950">
                    Akun sekolah yang belum terhubung
                  </p>
                  <p className="mt-1 text-xs text-blue-900">
                    Memilih akun akan menautkannya ke sekolah ini dan menyamakan
                    jenjang pendidikannya.
                  </p>
                  {candidates.length ? (
                    <ul className="mt-3 space-y-2">
                      {candidates.map((candidate) => (
                        <li
                          key={candidate.user_id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900">
                              {candidate.full_name || "Tanpa nama"}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {candidate.email || "-"}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={Boolean(mutating)}
                            onClick={() =>
                              toggleOperator(candidate.user_id, true)
                            }
                            className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}
                          >
                            {mutating === `${candidate.user_id}:add`
                              ? "Menambahkan…"
                              : "Pilih"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-blue-950">
                      Tidak ada akun sekolah yang berstatus tanpa sekolah.
                    </p>
                  )}
                </div>
              ) : null}

              {operators.length ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table
                    id="operator-list"
                    className="min-w-full text-left text-sm"
                  >
                    <thead className="border-y border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-3">
                          #
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Nama lengkap
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Email
                        </th>
                        <th scope="col" className="px-4 py-3 text-right">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {operators.map((operator, index) => (
                        <tr key={operator.user_id}>
                          <td className="px-4 py-3">{index + 1}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {operator.full_name || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {operator.email || "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {pendingRemoval === operator.user_id ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className="text-xs font-semibold text-rose-700">
                                  Lepas dari sekolah ini?
                                </span>
                                <button
                                  type="button"
                                  disabled={Boolean(mutating)}
                                  onClick={() =>
                                    toggleOperator(operator.user_id, false)
                                  }
                                  className={`${buttonClass} bg-rose-600 text-white hover:bg-rose-700`}
                                >
                                  {mutating === `${operator.user_id}:remove`
                                    ? "Menghapus…"
                                    : "Ya, hapus"}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(mutating)}
                                  onClick={() => setPendingRemoval(null)}
                                  className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(mutating)}
                                onClick={() => {
                                  setAdding(false);
                                  setPendingRemoval(operator.user_id);
                                }}
                                className={`${buttonClass} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}
                              >
                                Hapus
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                  Belum ada operator pada sekolah ini.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default function SchoolProfilePage() {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="grid min-h-screen place-items-center text-slate-600"
        >
          Memuat profil sekolah…
        </p>
      }
    >
      <SchoolProfileContent />
    </Suspense>
  );
}
