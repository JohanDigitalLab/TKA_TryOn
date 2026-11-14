"use client";

import Link from "next/link";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authLink, joinPath, localPath, text } from "@/lib/school/onboarding.mjs";
import { Field, inputClass, buttonClass } from "@/components/school/portal";

function Register() {
  const params = useSearchParams();
  const router = useRouter();
  const next = localPath(params.get("next"));
  const [school,setSchool] = useState(next.startsWith("/school/join"));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [destination,setDestination] = useState(next);
  const [resendEmail,setResendEmail] = useState("");
  const lock = useRef(false);
  async function register(event) {
    event.preventDefault(); if(lock.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError(""); setNotice("");
    try {
      const name = text(values.full_name,"Nama lengkap",2,160);
      if(values.password.length < 8) throw new Error("Password minimal 8 karakter.");
      const target = school ? (values.code?.trim() ? joinPath(values.code) : next.startsWith("/school/join") ? next : "/school/join") : next;
      lock.current=true; setBusy(true); setDestination(target); setResendEmail(values.email.trim());
      const { data,error } = await supabase.auth.signUp({ email:values.email.trim(),password:values.password,options:{ data:{ full_name:name,education_level:values.education_level,registration_method:school ? "school" : "independent" },emailRedirectTo:`${window.location.origin}${target}` } });
      if(error) throw error;
      setNotice("Pendaftaran dikirim. Verifikasi email untuk melanjutkan. Jika email sudah terdaftar, masuk dengan akun yang ada. Pendaftaran siswa tidak otomatis menggabungkan akun ke sekolah; preview dan konfirmasi undangan dilakukan sesudah verifikasi/login.");
      if(data.session && data.user?.email_confirmed_at) router.push(target);
    } catch(e) { setError(e.message || "Pendaftaran belum berhasil."); } finally { lock.current=false; setBusy(false); }
  }
  async function resend() {
    if(lock.current) return;
    if(!resendEmail.trim()) { setError("Masukkan email pendaftaran."); return; }
    lock.current=true; setBusy(true); setError(""); setNotice("");
    try { const { error } = await supabase.auth.resend({ type:"signup",email:resendEmail.trim(),options:{ emailRedirectTo:`${window.location.origin}${destination}` } }); if(error) throw error; setNotice("Jika dapat dikirim ulang, email konfirmasi akan masuk ke inbox Anda. Periksa juga spam."); } catch(e) { setError(e.message || "Email belum dapat dikirim."); } finally { lock.current=false; setBusy(false); }
  }
  return <main className="min-h-screen bg-slate-50 px-5 py-10"><div className="mx-auto max-w-xl space-y-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8"><Link href="/" className="font-bold text-blue-800">← Beranda</Link><h1 className="text-3xl font-black">Daftar akun siswa</h1><p>Akun mandiri tetap dapat belajar tanpa sekolah. Staf tidak perlu memilih pendidikan siswa: <Link href="/school/register" className="font-bold text-blue-800 underline">daftar akun staf / sekolah di sini</Link>.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={busy} aria-pressed={!school} className="min-h-11 rounded border px-4 py-2 font-bold aria-pressed:bg-blue-100" onClick={() => setSchool(false)}>Siswa mandiri</button><button type="button" disabled={busy} aria-pressed={school} className="min-h-11 rounded border px-4 py-2 font-bold aria-pressed:bg-blue-100" onClick={() => setSchool(true)}>Siswa undangan sekolah</button></div>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}{notice && <div role="status" className="space-y-2 rounded border border-green-200 bg-green-50 p-4 text-green-900"><p>{notice}</p><Link href={authLink("login",destination)} className="font-bold underline">Masuk dan lanjutkan →</Link></div>}
    <form onSubmit={register} aria-busy={busy}><fieldset disabled={busy} className="space-y-4"><Field name="full_name" label="Nama lengkap" autoComplete="name" minLength={2} maxLength={160} required /><Field name="email" label="Email" type="email" autoComplete="email" required /><Field name="education_level" label="Jenjang pendidikan siswa" required options={[{ value:"sd",label:"SD / MI" },{ value:"smp",label:"SMP / MTs" },{ value:"sma",label:"SMA / MA / SMK" }]} />{school && <><Field name="code" label="Kode undangan (opsional bila akan dimasukkan setelah login)" minLength={64} maxLength={64} defaultValue={next.startsWith("/school/join") ? new URL(next,"https://local.invalid").searchParams.get("code") || "" : ""} /><p className="text-sm text-slate-600">Kode digunakan di portal setelah email terverifikasi, bukan sekadar metadata pendaftaran. Permintaan tetap menunggu persetujuan admin.</p></>}<Field name="password" label="Password (minimal 8 karakter)" type="password" autoComplete="new-password" minLength={8} required /><button className={`${buttonClass} w-full`} type="submit">{busy ? "Memproses…" : "Buat akun siswa"}</button></fieldset></form>
    <section className="space-y-3 border-t border-slate-200 pt-5"><h2 className="font-bold">Kirim ulang verifikasi email</h2><label className="block text-sm font-semibold">Email pendaftaran<input className={inputClass} type="email" value={resendEmail} disabled={busy} onChange={e => setResendEmail(e.target.value)} /></label><button type="button" className={buttonClass} disabled={busy} onClick={resend}>Kirim ulang</button></section><p>Sudah punya akun? <Link href={authLink("login",next)} className="font-bold text-blue-800 underline">Masuk</Link> · <Link href="/school/join" className="font-bold text-blue-800 underline">Gabung sekolah</Link></p>
  </div></main>;
}
export default function RegisterPage() { return <Suspense fallback={<p role="status" className="p-8">Memuat pendaftaran…</p>}><Register /></Suspense>; }
