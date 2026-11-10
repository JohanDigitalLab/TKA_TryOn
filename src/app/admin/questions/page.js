
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 25;

const QUESTION_SELECT = `
  id,
  question_code,
  education_level_id,
  grade,
  school_type,
  subject_code,
  subject_name,
  subject_category,
  curriculum_reference,
  element,
  material,
  sub_material,
  competency,
  indicator,
  cognitive_level,
  difficulty,
  question_structure,
  group_order,
  question_type,
  question_status,
  source_type,
  source_reference,
  usage_rights,
  created_at,
  question_versions!inner (
    id,
    version_number,
    instruction,
    question_text,
    explanation,
    version_status,
    is_current,
    created_at,
    question_stimuli (
      id,
      stimulus_code,
      stimulus_type,
      title,
      content_text,
      file_url,
      media_description,
      source_reference,
      usage_rights,
      stimulus_status
    ),
    question_options (
      id,
      option_code,
      option_text,
      option_order,
      is_correct,
      explanation
    ),
    question_category_items (
      id,
      item_number,
      item_text,
      category_label,
      correct_category,
      explanation
    )
  )
`;

const PERMISSIONS = {
  view: "bank_soal.view",
  review: "bank_soal.review",
  edit: "bank_soal.edit",
};

const STIMULUS_TYPES = [
  "TEKS",
  "GAMBAR",
  "TABEL",
  "GRAFIK",
  "AUDIO",
  "VIDEO",
  "LAINNYA",
];

const USAGE_RIGHTS = [
  "ORISINAL",
  "BERLISENSI",
  "IZIN_TERTULIS",
  "DOMAIN_PUBLIK",
];

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function labelType(type) {
  const labels = {
    PG_TUNGGAL: "Pilihan Ganda",
    PGK_MA: "PG Kompleks",
    PGK_KATEGORI: "PG Kategori",
  };

  return labels[type] || type || "-";
}

function statusStyle(status) {
  const value = String(status || "").toUpperCase();

  if (value === "PUBLISHED") return "bg-green-100 text-green-700";
  if (value === "DRAFT") return "bg-amber-100 text-amber-700";
  if (value === "REVIEW" || value === "PENDING_REVIEW")
    return "bg-blue-100 text-blue-700";
  if (value === "REJECTED" || value === "NEEDS_REVISION")
    return "bg-red-100 text-red-700";

  return "bg-slate-100 text-slate-600";
}

function currentVersion(question) {
  const versions = [...(question?.question_versions || [])];

  return (
    versions.find((version) => version.is_current) ||
    versions.sort((a, b) => b.version_number - a.version_number)[0] ||
    null
  );
}

function getQuestionText(question) {
  return currentVersion(question)?.question_text || "";
}

function createEditorData(question, version) {
  const stimulus = version?.question_stimuli || null;

  return {
    instruction: version?.instruction || "",
    question_text: version?.question_text || "",
    explanation: version?.explanation || "",

    stimulus: {
      enabled: !!stimulus,
      stimulus_type: stimulus?.stimulus_type || "TEKS",
      title: stimulus?.title || "",
      content_text: stimulus?.content_text || "",
      file_url: stimulus?.file_url || "",
      media_description: stimulus?.media_description || "",
      source_reference: stimulus?.source_reference || "",
      usage_rights: stimulus?.usage_rights || "ORISINAL",
    },

    options: (version?.question_options || [])
      .slice()
      .sort((a, b) => a.option_order - b.option_order)
      .map((option) => ({
        option_code: option.option_code || "",
        option_text: option.option_text || "",
        is_correct: !!option.is_correct,
        explanation: option.explanation || "",
      })),

    category_items: (version?.question_category_items || [])
      .slice()
      .sort((a, b) => a.item_number - b.item_number)
      .map((item) => ({
        item_text: item.item_text || "",
        category_label: item.category_label || "BENAR / SALAH",
        correct_category: item.correct_category || "BENAR",
        explanation: item.explanation || "",
      })),
  };
}

function normalizeEditorPayload(form, questionType) {
  return {
    instruction: form.instruction.trim(),
    question_text: form.question_text.trim(),
    explanation: form.explanation.trim(),

    stimulus: form.stimulus.enabled
      ? {
          enabled: true,
          stimulus_type: form.stimulus.stimulus_type,
          title: form.stimulus.title.trim(),
          content_text: form.stimulus.content_text.trim(),
          file_url: form.stimulus.file_url.trim(),
          media_description: form.stimulus.media_description.trim(),
          source_reference: form.stimulus.source_reference.trim(),
          usage_rights: form.stimulus.usage_rights,
        }
      : null,

    options:
      questionType === "PGK_KATEGORI"
        ? []
        : form.options.map((option, index) => ({
            option_code:
              option.option_code.trim() || String.fromCharCode(65 + index),
            option_text: option.option_text.trim(),
            is_correct: !!option.is_correct,
            explanation: option.explanation.trim(),
          })),

    category_items:
      questionType === "PGK_KATEGORI"
        ? form.category_items.map((item) => ({
            item_text: item.item_text.trim(),
            category_label: item.category_label.trim() || "BENAR / SALAH",
            correct_category: item.correct_category,
            explanation: item.explanation.trim(),
          }))
        : [],
  };
}

export default function BankSoalPage() {
  const reviewPanelRef = useRef(null);

  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [userRole, setUserRole] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState("ALL");
  const [filterGrade, setFilterGrade] = useState("ALL");
  const [filterSubject, setFilterSubject] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [showAnswerKey, setShowAnswerKey] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorForm, setEditorForm] = useState(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [editorSuccess, setEditorSuccess] = useState("");

  const can = useCallback(
    (permission) => isAdmin && permissions.includes(permission),
    [isAdmin, permissions]
  );

  // =====================================================
  // VERIFIKASI AKSES SUPER ADMIN / ADMIN OPERATOR
  // =====================================================

  const verifyAccess = useCallback(async (currentSession) => {
    if (!currentSession?.user) {
      setIsAdmin(false);
      setPermissions([]);
      setUserRole("");
      return false;
    }

    const userId = currentSession.user.id;

    // Super Admin diperiksa melalui role global.
    const { data: superAdmin, error: roleError } = await supabase
      .from("user_global_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (roleError) {
      setIsAdmin(false);
      setPermissions([]);
      setUserRole("");
      return false;
    }

    if (superAdmin) {
      setIsAdmin(true);
      setUserRole("Super Admin");
      setPermissions([
        PERMISSIONS.view,
        PERMISSIONS.review,
        PERMISSIONS.edit,
        "bank_soal.moderate",
        "bank_soal.publish",
        "bank_soal.import",
      ]);
      return true;
    }

    // Operator diperiksa melalui permission RPC.
    const requestedPermissions = [
      PERMISSIONS.view,
      PERMISSIONS.review,
      PERMISSIONS.edit,
    ];

    const results = await Promise.all(
      requestedPermissions.map((permission) =>
        supabase.rpc("admin_has_permission", {
          p_permission_code: permission,
        })
      )
    );

    if (results.some((result) => result.error)) {
      setIsAdmin(false);
      setPermissions([]);
      setUserRole("");
      return false;
    }

    const granted = requestedPermissions.filter(
      (_, index) => results[index].data === true
    );

    if (!granted.includes(PERMISSIONS.view)) {
      setIsAdmin(false);
      setPermissions([]);
      setUserRole("");
      return false;
    }

    setIsAdmin(true);
    setUserRole("Admin Operator");
    setPermissions(granted);

    return true;
  }, []);

  // =====================================================
  // PEMERIKSAAN SESI
  // =====================================================

  useEffect(() => {
    let alive = true;

    async function initialize() {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (!alive) return;

      if (sessionError) setAuthError(sessionError.message);

      setSession(data.session);

      if (data.session) {
        await verifyAccess(data.session);
      }

      if (alive) setAuthReady(true);
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!alive) return;

      setSession(newSession);

      if (!newSession) {
        setIsAdmin(false);
        setPermissions([]);
        setUserRole("");
        setQuestions([]);
        setSelectedQuestion(null);
      } else {
        verifyAccess(newSession);
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [verifyAccess]);

  // =====================================================
  // LOGIN
  // =====================================================

  async function handleLogin(event) {
    event.preventDefault();

    setAuthLoading(true);
    setAuthError("");

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (loginError) throw loginError;

      setSession(data.session);

      const allowed = await verifyAccess(data.session);

      if (!allowed) {
        await supabase.auth.signOut();
        setSession(null);

        throw new Error(
          "Akun ini belum memiliki permission untuk mengakses Bank Soal."
        );
      }
    } catch (err) {
      setAuthError(err.message || "Login gagal.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setSession(null);
    setIsAdmin(false);
    setPermissions([]);
    setUserRole("");
    setQuestions([]);
    setSelectedQuestion(null);
    setEditorOpen(false);
  }

  // =====================================================
  // MEMUAT BANK SOAL
  // =====================================================

  const loadQuestions = useCallback(async () => {
    if (!session || !isAdmin || !can(PERMISSIONS.view)) return;

    setLoading(true);
    setError("");

    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("questions")
        .select(QUESTION_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filterLevel !== "ALL") {
        query = query.eq("education_level_id", filterLevel);
      }

      if (filterGrade !== "ALL") {
        query = query.eq("grade", Number(filterGrade));
      }

      if (filterSubject !== "ALL") {
        query = query.eq("subject_name", filterSubject);
      }

      if (filterType !== "ALL") {
        query = query.eq("question_type", filterType);
      }

      if (filterStatus !== "ALL") {
        query = query.eq("question_status", filterStatus);
      }

      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;

      setQuestions(data || []);
      setTotalCount(count || 0);

      setSelectedQuestion((previous) => {
        if (!previous) return null;

        return (
          (data || []).find((item) => item.id === previous.id) || null
        );
      });
    } catch (err) {
      setError(
        err.message ||
          "Bank soal belum berhasil dimuat. Periksa akses database dan relasi tabel."
      );
    } finally {
      setLoading(false);
    }
  }, [
    session,
    isAdmin,
    can,
    page,
    filterLevel,
    filterGrade,
    filterSubject,
    filterType,
    filterStatus,
  ]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // =====================================================
  // AUTO-SCROLL PANEL TELAAH
  // =====================================================

  useEffect(() => {
    if (selectedQuestion && reviewPanelRef.current) {
      reviewPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedQuestion]);

  // =====================================================
  // FILTER DAN PENCARIAN
  // =====================================================

  const filterOptions = useMemo(() => {
    const unique = (values) =>
      [...new Set(values.filter(Boolean))].sort();

    return {
      subjects: unique(questions.map((q) => q.subject_name)),
      levels: unique(questions.map((q) => q.education_level_id)),
      grades: unique(questions.map((q) => String(q.grade))),
    };
  }, [questions]);

  const visibleQuestions = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return questions;

    return questions.filter((question) => {
      const version = currentVersion(question);

      const searchable = [
        question.question_code,
        question.subject_name,
        question.element,
        question.material,
        question.indicator,
        version?.question_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(keyword);
    });
  }, [questions, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / PAGE_SIZE)
  );

  // =====================================================
  // EDITOR SOAL
  // =====================================================

  function openEditor() {
    if (!selectedQuestion || !selectedVersion) return;

    if (!can(PERMISSIONS.edit)) {
      setEditorError("Akun ini tidak memiliki permission bank_soal.edit.");
      return;
    }

    setEditorForm(
      createEditorData(selectedQuestion, selectedVersion)
    );

    setEditorError("");
    setEditorSuccess("");
    setEditorOpen(true);
  }

  function updateEditorField(field, value) {
    setEditorForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function updateStimulusField(field, value) {
    setEditorForm((previous) => ({
      ...previous,
      stimulus: {
        ...previous.stimulus,
        [field]: value,
      },
    }));
  }

  function updateOption(index, field, value) {
    setEditorForm((previous) => ({
      ...previous,
      options: previous.options.map((option, optionIndex) =>
        optionIndex === index
          ? { ...option, [field]: value }
          : option
      ),
    }));
  }

  function addOption() {
    setEditorForm((previous) => ({
      ...previous,
      options: [
        ...previous.options,
        {
          option_code: String.fromCharCode(65 + previous.options.length),
          option_text: "",
          is_correct: false,
          explanation: "",
        },
      ],
    }));
  }

  function removeOption(index) {
    setEditorForm((previous) => ({
      ...previous,
      options: previous.options.filter(
        (_, optionIndex) => optionIndex !== index
      ),
    }));
  }

  function updateCategoryItem(index, field, value) {
    setEditorForm((previous) => ({
      ...previous,
      category_items: previous.category_items.map(
        (item, itemIndex) =>
          itemIndex === index
            ? { ...item, [field]: value }
            : item
      ),
    }));
  }

  function addCategoryItem() {
    setEditorForm((previous) => ({
      ...previous,
      category_items: [
        ...previous.category_items,
        {
          item_text: "",
          category_label: "BENAR / SALAH",
          correct_category: "BENAR",
          explanation: "",
        },
      ],
    }));
  }

  function removeCategoryItem(index) {
    setEditorForm((previous) => ({
      ...previous,
      category_items: previous.category_items.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  }

  function validateEditor() {
    if (!editorForm.question_text.trim()) {
      return "Teks pertanyaan wajib diisi.";
    }

    if (selectedQuestion.question_type === "PG_TUNGGAL") {
      if (editorForm.options.length < 2) {
        return "Pilihan Ganda harus memiliki minimal dua opsi.";
      }

      const correct = editorForm.options.filter(
        (option) => option.is_correct
      ).length;

      if (correct !== 1) {
        return "Pilihan Ganda harus memiliki tepat satu kunci jawaban.";
      }
    }

    if (selectedQuestion.question_type === "PGK_MA") {
      if (editorForm.options.length < 2) {
        return "PG Kompleks harus memiliki minimal dua opsi.";
      }

      if (!editorForm.options.some((option) => option.is_correct)) {
        return "PG Kompleks harus memiliki minimal satu jawaban benar.";
      }
    }

    if (selectedQuestion.question_type === "PGK_KATEGORI") {
      if (editorForm.category_items.length < 1) {
        return "PG Kategori harus memiliki minimal satu pernyataan.";
      }

      if (
        editorForm.category_items.some(
          (item) =>
            !item.item_text.trim() ||
            !["BENAR", "SALAH"].includes(item.correct_category)
        )
      ) {
        return "Lengkapi semua pernyataan dan kunci kategori.";
      }
    }

    return "";
  }

  async function saveRevision(event) {
    event.preventDefault();

    if (!selectedQuestion || !editorForm) return;

    if (!can(PERMISSIONS.edit)) {
      setEditorError("Permission bank_soal.edit tidak tersedia.");
      return;
    }

    const validationError = validateEditor();

    if (validationError) {
      setEditorError(validationError);
      return;
    }

    const confirmed = window.confirm(
      "Simpan perubahan sebagai versi baru berstatus PENDING_REVIEW? Versi PUBLISHED sebelumnya tetap dipertahankan."
    );

    if (!confirmed) return;

    setEditorSaving(true);
    setEditorError("");
    setEditorSuccess("");

    try {
      const payload = normalizeEditorPayload(
        editorForm,
        selectedQuestion.question_type
      );

      const { data, error: rpcError } = await supabase.rpc(
        "save_question_revision",
        {
          p_question_id: selectedQuestion.id,
          p_payload: payload,
        }
      );

      if (rpcError) throw rpcError;

      if (!data?.success) {
        throw new Error("Database tidak mengonfirmasi penyimpanan revisi.");
      }

      setEditorSuccess(
        `Revisi berhasil disimpan sebagai versi ${data.version_number} dengan status ${data.version_status}.`
      );

      setEditorOpen(false);
      setEditorForm(null);
      setShowAnswerKey(false);

      await loadQuestions();

      // Ambil ulang detail soal setelah revisi dibuat.
      const { data: refreshed, error: refreshError } = await supabase
        .from("questions")
        .select(QUESTION_SELECT)
        .eq("id", selectedQuestion.id)
        .single();

      if (refreshError) throw refreshError;

      setSelectedQuestion(refreshed);
    } catch (err) {
      setEditorError(err.message || "Gagal menyimpan revisi soal.");
    } finally {
      setEditorSaving(false);
    }
  }

  // =====================================================
  // LOGIN / LOADING
  // =====================================================

  if (!authReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
        Memeriksa sesi Supabase…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">
              T
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                TKA TryOn
              </h1>
              <p className="text-xs text-slate-500">
                Academic Content Management
              </p>
            </div>
          </div>

          <h2 className="text-lg font-bold text-slate-900">
            Masuk ke Bank Soal
          </h2>

          <label className="mt-5 block text-sm font-semibold">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-600"
          />

          <label className="mt-4 block text-sm font-semibold">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-600"
          />

          {authError && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {authError}
            </p>
          )}

          <button
            disabled={authLoading}
            className="mt-5 w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {authLoading ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Akses belum tersedia
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Akun ini belum memiliki permission bank_soal.view.
          </p>
          <button
            onClick={handleLogout}
            className="mt-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Keluar
          </button>
        </section>
      </main>
    );
  }

  // =====================================================
  // HALAMAN BANK SOAL
  // =====================================================

  const selectedVersion = selectedQuestion
    ? currentVersion(selectedQuestion)
    : null;

  const selectedStimulus =
    selectedVersion?.question_stimuli || null;

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-800 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-700">
              ACADEMIC CONTENT MANAGEMENT
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
              Bank Soal
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Pusat data soal dan telaah konten akademik TKA TryOn.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-green-100 px-3 py-2 text-xs font-bold text-green-700">
              {userRole}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
            >
              Keluar
            </button>
          </div>
        </header>

        {editorSuccess && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {editorSuccess}
            <button
              onClick={() => setEditorSuccess("")}
              className="ml-3 font-bold underline"
            >
              Tutup
            </button>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Total Bank Soal</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">
              {totalCount.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Soal pada Halaman Ini</p>
            <p className="mt-2 text-3xl font-extrabold text-blue-700">
              {questions.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Halaman</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">
              {page + 1} / {totalPages}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-slate-900">
              Pencarian dan Filter
            </h2>
            <button
              onClick={() => {
                setSearch("");
                setFilterLevel("ALL");
                setFilterGrade("ALL");
                setFilterSubject("ALL");
                setFilterType("ALL");
                setFilterStatus("ALL");
                setPage(0);
              }}
              className="text-sm font-semibold text-blue-700"
            >
              Reset Filter
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode, isi soal, materi..."
              className="rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-600"
            />

            <select
              value={filterLevel}
              onChange={(event) => {
                setFilterLevel(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="ALL">Semua Jenjang</option>
              {filterOptions.levels.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>

            <select
              value={filterGrade}
              onChange={(event) => {
                setFilterGrade(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="ALL">Semua Kelas</option>
              {filterOptions.grades.map((value) => (
                <option key={value} value={value}>
                  Kelas {value}
                </option>
              ))}
            </select>

            <select
              value={filterSubject}
              onChange={(event) => {
                setFilterSubject(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="ALL">Semua Mata Pelajaran</option>
              {filterOptions.subjects.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <select
              value={filterType}
              onChange={(event) => {
                setFilterType(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="ALL">Semua Tipe Soal</option>
              <option value="PG_TUNGGAL">Pilihan Ganda</option>
              <option value="PGK_MA">PG Kompleks</option>
              <option value="PGK_KATEGORI">PG Kategori</option>
            </select>

            <select
              value={filterStatus}
              onChange={(event) => {
                setFilterStatus(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="ALL">Semua Status</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_REVIEW">Menunggu Telaah</option>
              <option value="NEEDS_REVISION">Perlu Revisi</option>
              <option value="APPROVED">Approved</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Gagal memuat Bank Soal.</strong>
            <p className="mt-1">{error}</p>
            <button
              onClick={loadQuestions}
              className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-bold text-white"
            >
              Coba Lagi
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div>
              <h2 className="font-bold text-slate-900">Daftar Soal</h2>
              <p className="mt-1 text-xs text-slate-500">
                Pilih soal untuk membuka detail dan telaah.
              </p>
            </div>
            <button
              onClick={loadQuestions}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Memuat…" : "↻ Muat Ulang"}
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Mengambil data Bank Soal…
            </div>
          ) : visibleQuestions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-semibold text-slate-700">
                Tidak ada soal yang ditemukan.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Coba ubah kata kunci atau filter pencarian.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Kode / Soal</th>
                    <th className="px-5 py-4">Jenjang</th>
                    <th className="px-5 py-4">Mata Pelajaran</th>
                    <th className="px-5 py-4">Tipe</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Tanggal</th>
                    <th className="px-5 py-4">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleQuestions.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-blue-50/50 ${
                        selectedQuestion?.id === item.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="max-w-md px-5 py-4">
                        <p className="font-bold text-slate-900">
                          {item.question_code}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {getQuestionText(item)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold">
                          {item.education_level_id?.toUpperCase()}
                        </p>
                        <p className="text-xs text-slate-500">
                          Kelas {item.grade}
                        </p>
                      </td>
                      <td className="px-5 py-4">{item.subject_name}</td>
                      <td className="px-5 py-4">
                        {labelType(item.question_type)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(
                            item.question_status
                          )}`}
                        >
                          {item.question_status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => {
                            setSelectedQuestion(item);
                            setShowAnswerKey(false);
                            setEditorOpen(false);
                            setEditorError("");
                          }}
                          className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800"
                        >
                          Telaah
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
            <p className="text-xs text-slate-500">
              Menampilkan {visibleQuestions.length} soal pada halaman{" "}
              {page + 1} dari {totalPages}.
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <button
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        </section>

        {/* DETAIL / TELAAH SOAL */}

        {selectedQuestion && (
          <section
            ref={reviewPanelRef}
            className="scroll-mt-5 rounded-xl border border-blue-200 bg-white shadow-sm"
          >
            {!selectedVersion ? (
              <div className="p-6 text-sm text-amber-700">
                Versi soal belum dapat dimuat. Muat ulang Bank Soal.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
                  <div>
                    <p className="text-xs font-bold tracking-widest text-blue-700">
                      QUESTION REVIEW
                    </p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                      Telaah Soal
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedQuestion.question_code} · Versi{" "}
                      {selectedVersion.version_number}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {can(PERMISSIONS.edit) && (
                      <button
                        onClick={openEditor}
                        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
                      >
                        Edit Soal
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedQuestion(null);
                        setEditorOpen(false);
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                    >
                      Tutup Detail
                    </button>
                  </div>
                </div>

                {editorError && !editorOpen && (
                  <div className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {editorError}
                  </div>
                )}

                <div className="grid gap-6 p-5 lg:grid-cols-[1fr_280px]">
                  <div className="space-y-5">
                    {selectedStimulus && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                          Stimulus
                        </p>
                        {selectedStimulus.title && (
                          <h3 className="mt-2 font-bold text-slate-900">
                            {selectedStimulus.title}
                          </h3>
                        )}
                        {selectedStimulus.content_text && (
                          <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                            {selectedStimulus.content_text}
                          </div>
                        )}
                        {selectedStimulus.file_url && (
                          <a
                            href={selectedStimulus.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-block text-sm font-semibold text-blue-700 underline"
                          >
                            Buka media stimulus
                          </a>
                        )}
                        <p className="mt-3 text-xs text-slate-500">
                          Kode: {selectedStimulus.stimulus_code} ·{" "}
                          {selectedStimulus.stimulus_type}
                        </p>
                      </div>
                    )}

                    {selectedVersion.instruction && (
                      <div className="rounded-lg bg-blue-50 p-4">
                        <p className="text-xs font-bold text-blue-700">
                          INSTRUKSI
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {selectedVersion.instruction}
                        </p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">
                        Pertanyaan
                      </p>
                      <div className="mt-3 whitespace-pre-wrap text-base font-medium leading-8 text-slate-900">
                        {selectedVersion.question_text}
                      </div>
                    </div>

                    {selectedQuestion.question_type !== "PGK_KATEGORI" && (
                      <div className="space-y-3">
                        <h3 className="font-bold text-slate-900">
                          Pilihan Jawaban
                        </h3>
                        {(selectedVersion.question_options || [])
                          .slice()
                          .sort((a, b) => a.option_order - b.option_order)
                          .map((option) => (
                            <div
                              key={option.id}
                              className={`rounded-lg border p-4 ${
                                showAnswerKey && option.is_correct
                                  ? "border-green-300 bg-green-50"
                                  : "border-slate-200"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <span className="font-bold">
                                  {option.option_code}.
                                </span>
                                <span className="flex-1 text-sm leading-6">
                                  {option.option_text}
                                </span>
                                {showAnswerKey && option.is_correct && (
                                  <span className="text-xs font-bold text-green-700">
                                    KUNCI
                                  </span>
                                )}
                              </div>
                              {showAnswerKey && option.explanation && (
                                <p className="mt-2 border-t border-slate-200 pt-2 text-xs leading-5 text-slate-600">
                                  {option.explanation}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {selectedQuestion.question_type === "PGK_KATEGORI" && (
                      <div className="space-y-3">
                        <h3 className="font-bold text-slate-900">
                          Pernyataan Kategori
                        </h3>
                        {(selectedVersion.question_category_items || [])
                          .slice()
                          .sort((a, b) => a.item_number - b.item_number)
                          .map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-slate-200 p-4"
                            >
                              <p className="text-sm font-medium leading-6">
                                {item.item_number}. {item.item_text}
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                                  Kategori: {item.category_label}
                                </span>
                                {showAnswerKey && (
                                  <span className="rounded-md bg-green-100 px-3 py-2 text-xs font-bold text-green-700">
                                    Kunci: {item.correct_category}
                                  </span>
                                )}
                              </div>
                              {showAnswerKey && item.explanation && (
                                <p className="mt-3 text-xs leading-5 text-slate-600">
                                  {item.explanation}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {showAnswerKey && (
                      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                        <p className="text-xs font-bold uppercase text-green-800">
                          Pembahasan Umum
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                          {selectedVersion.explanation ||
                            "Pembahasan umum belum tersedia."}
                        </p>
                      </div>
                    )}
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <h3 className="font-bold text-slate-900">
                        Metadata Soal
                      </h3>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500">
                            Jenjang / Kelas
                          </dt>
                          <dd className="font-semibold">
                            {selectedQuestion.education_level_id?.toUpperCase()}{" "}
                            / {selectedQuestion.grade}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Mata Pelajaran
                          </dt>
                          <dd className="font-semibold">
                            {selectedQuestion.subject_name}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Kategori Mapel
                          </dt>
                          <dd className="font-semibold">
                            {selectedQuestion.subject_category}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Tipe Soal
                          </dt>
                          <dd className="font-semibold">
                            {labelType(selectedQuestion.question_type)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Struktur</dt>
                          <dd className="font-semibold">
                            {selectedQuestion.question_structure}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Elemen / Materi
                          </dt>
                          <dd className="font-semibold">
                            {selectedQuestion.element || "-"} /{" "}
                            {selectedQuestion.material || "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Indikator
                          </dt>
                          <dd className="leading-5">
                            {selectedQuestion.indicator || "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Level Kognitif
                          </dt>
                          <dd className="font-semibold">
                            {selectedQuestion.cognitive_level || "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Kesulitan
                          </dt>
                          <dd className="font-semibold">
                            {selectedQuestion.difficulty || "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Hak Penggunaan
                          </dt>
                          <dd className="font-semibold">
                            {selectedQuestion.usage_rights}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">
                            Versi Aktif
                          </dt>
                          <dd className="font-semibold">
                            v{selectedVersion.version_number}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Status</dt>
                          <dd>
                            <span
                              className={`inline-block rounded-full px-2 py-1 text-xs font-bold ${statusStyle(
                                selectedQuestion.question_status
                              )}`}
                            >
                              {selectedQuestion.question_status}
                            </span>
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <h3 className="font-bold text-amber-900">
                        Kontrol Telaah
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-amber-800">
                        Kunci jawaban dan pembahasan hanya ditampilkan melalui
                        kontrol ini.
                      </p>
                      <button
                        onClick={() =>
                          setShowAnswerKey((value) => !value)
                        }
                        className="mt-4 w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700"
                      >
                        {showAnswerKey
                          ? "Sembunyikan Kunci"
                          : "Tampilkan Kunci & Pembahasan"}
                      </button>
                    </div>
                  </aside>
                </div>
              </>
            )}
          </section>
        )}

        {/* FORM EDITOR */}

        {editorOpen && editorForm && selectedQuestion && (
          <section className="rounded-xl border border-blue-300 bg-white shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-bold tracking-widest text-blue-700">
                  QUESTION EDITOR
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  Edit Soal
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedQuestion.question_code} ·{" "}
                  {labelType(selectedQuestion.question_type)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                Batal
              </button>
            </div>

            <form onSubmit={saveRevision} className="space-y-6 p-5">
              {editorError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {editorError}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">
                  Instruksi dan Pertanyaan
                </h3>

                <label className="mt-4 block text-sm font-semibold">
                  Instruksi
                </label>
                <textarea
                  rows={3}
                  value={editorForm.instruction}
                  onChange={(event) =>
                    updateEditorField("instruction", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                />

                <label className="mt-4 block text-sm font-semibold">
                  Teks Pertanyaan *
                </label>
                <textarea
                  required
                  rows={6}
                  value={editorForm.question_text}
                  onChange={(event) =>
                    updateEditorField("question_text", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                />
              </div>

              {/* STIMULUS */}

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-900">Stimulus</h3>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={editorForm.stimulus.enabled}
                      onChange={(event) =>
                        updateStimulusField("enabled", event.target.checked)
                      }
                      className="h-4 w-4 accent-blue-700"
                    />
                    Gunakan stimulus
                  </label>
                </div>

                {editorForm.stimulus.enabled && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold">
                        Jenis Stimulus
                      </label>
                      <select
                        value={editorForm.stimulus.stimulus_type}
                        onChange={(event) =>
                          updateStimulusField(
                            "stimulus_type",
                            event.target.value
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                      >
                        {STIMULUS_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold">
                        Hak Penggunaan
                      </label>
                      <select
                        value={editorForm.stimulus.usage_rights}
                        onChange={(event) =>
                          updateStimulusField(
                            "usage_rights",
                            event.target.value
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                      >
                        {USAGE_RIGHTS.map((right) => (
                          <option key={right} value={right}>
                            {right}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold">
                        Judul Stimulus
                      </label>
                      <input
                        value={editorForm.stimulus.title}
                        onChange={(event) =>
                          updateStimulusField("title", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold">
                        Isi Stimulus
                      </label>
                      <textarea
                        rows={5}
                        value={editorForm.stimulus.content_text}
                        onChange={(event) =>
                          updateStimulusField(
                            "content_text",
                            event.target.value
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold">
                        URL Media
                      </label>
                      <input
                        value={editorForm.stimulus.file_url}
                        onChange={(event) =>
                          updateStimulusField("file_url", event.target.value)
                        }
                        placeholder="https://..."
                        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold">
                        Deskripsi Media
                      </label>
                      <textarea
                        rows={2}
                        value={editorForm.stimulus.media_description}
                        onChange={(event) =>
                          updateStimulusField(
                            "media_description",
                            event.target.value
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold">
                        Sumber Referensi
                      </label>
                      <input
                        value={editorForm.stimulus.source_reference}
                        onChange={(event) =>
                          updateStimulusField(
                            "source_reference",
                            event.target.value
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* PILIHAN GANDA */}

              {selectedQuestion.question_type !== "PGK_KATEGORI" && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900">
                        Pilihan Jawaban
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedQuestion.question_type === "PG_TUNGGAL"
                          ? "Pilih tepat satu jawaban benar."
                          : "Pilih satu atau lebih jawaban benar."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addOption}
                      className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700"
                    >
                      + Tambah Opsi
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {editorForm.options.map((option, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-sm font-bold text-slate-700">
                            Opsi {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeOption(index)}
                            disabled={editorForm.options.length <= 2}
                            className="text-xs font-semibold text-red-600 disabled:opacity-30"
                          >
                            Hapus opsi
                          </button>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-[100px_1fr]">
                          <div>
                            <label className="text-xs font-semibold">
                              Kode
                            </label>
                            <input
                              value={option.option_code}
                              onChange={(event) =>
                                updateOption(
                                  index,
                                  "option_code",
                                  event.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold">
                              Teks Opsi
                            </label>
                            <textarea
                              rows={2}
                              value={option.option_text}
                              onChange={(event) =>
                                updateOption(
                                  index,
                                  "option_text",
                                  event.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                            />
                          </div>
                        </div>

                        <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                          <input
                            type={
                              selectedQuestion.question_type === "PG_TUNGGAL"
                                ? "radio"
                                : "checkbox"
                            }
                            name="single-correct-answer"
                            checked={option.is_correct}
                            onChange={(event) => {
                              if (
                                selectedQuestion.question_type ===
                                "PG_TUNGGAL"
                              ) {
                                setEditorForm((previous) => ({
                                  ...previous,
                                  options: previous.options.map(
                                    (item, itemIndex) => ({
                                      ...item,
                                      is_correct: itemIndex === index,
                                    })
                                  ),
                                }));
                              } else {
                                updateOption(
                                  index,
                                  "is_correct",
                                  event.target.checked
                                );
                              }
                            }}
                            className="h-4 w-4 accent-green-700"
                          />
                          Jawaban benar
                        </label>

                        <label className="mt-3 block text-xs font-semibold">
                          Pembahasan Opsi
                        </label>
                        <textarea
                          rows={2}
                          value={option.explanation}
                          onChange={(event) =>
                            updateOption(
                              index,
                              "explanation",
                              event.target.value
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PG KATEGORI */}

              {selectedQuestion.question_type === "PGK_KATEGORI" && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900">
                        Pernyataan Kategori
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Tentukan kunci BENAR atau SALAH untuk setiap
                        pernyataan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addCategoryItem}
                      className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700"
                    >
                      + Tambah Pernyataan
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {editorForm.category_items.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-slate-200 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-700">
                            Pernyataan {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCategoryItem(index)}
                            disabled={editorForm.category_items.length <= 1}
                            className="text-xs font-semibold text-red-600 disabled:opacity-30"
                          >
                            Hapus
                          </button>
                        </div>

                        <label className="mt-3 block text-xs font-semibold">
                          Teks Pernyataan
                        </label>
                        <textarea
                          rows={3}
                          value={item.item_text}
                          onChange={(event) =>
                            updateCategoryItem(
                              index,
                              "item_text",
                              event.target.value
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                        />

                        <label className="mt-3 block text-xs font-semibold">
                          Kunci Jawaban
                        </label>
                        <div className="mt-2 flex gap-4">
                          {["BENAR", "SALAH"].map((category) => (
                            <label
                              key={category}
                              className="flex items-center gap-2 text-sm font-semibold"
                            >
                              <input
                                type="radio"
                                name={`category-${index}`}
                                checked={item.correct_category === category}
                                onChange={() =>
                                  updateCategoryItem(
                                    index,
                                    "correct_category",
                                    category
                                  )
                                }
                                className="h-4 w-4 accent-blue-700"
                              />
                              {category}
                            </label>
                          ))}
                        </div>

                        <label className="mt-3 block text-xs font-semibold">
                          Pembahasan Pernyataan
                        </label>
                        <textarea
                          rows={2}
                          value={item.explanation}
                          onChange={(event) =>
                            updateCategoryItem(
                              index,
                              "explanation",
                              event.target.value
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PEMBAHASAN UMUM */}

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">
                  Pembahasan Umum
                </h3>
                <textarea
                  rows={5}
                  value={editorForm.explanation}
                  onChange={(event) =>
                    updateEditorField("explanation", event.target.value)
                  }
                  className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
                  placeholder="Tuliskan pembahasan umum soal..."
                />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">
                  Alur penyimpanan revisi
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Perubahan akan disimpan sebagai versi baru dengan status
                  PENDING_REVIEW. Versi PUBLISHED sebelumnya tidak diubah
                  dan tetap menjadi versi aktif sampai proses telaah dan
                  publikasi berikutnya.
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  disabled={editorSaving}
                  className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editorSaving}
                  className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {editorSaving ? "Menyimpan Revisi..." : "Simpan Versi Baru"}
                </button>
              </div>
            </form>
          </section>
        )}

        <footer className="border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
          © 2026 TKA TryOn · Academic Content Management
        </footer>
      </div>
    </main>
  );
}
