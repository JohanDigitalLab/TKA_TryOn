
"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  import: "bank_soal.import",
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
        PERMISSIONS.import,
      ]);
      return true;
    }

    // Operator diperiksa melalui permission RPC.
    const requestedPermissions = [
      PERMISSIONS.view,
      PERMISSIONS.review,
      PERMISSIONS.edit,
      PERMISSIONS.import,
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

  const loadQuestions = useCallback(async (signal) => {
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

      if (signal) query = query.abortSignal(signal);
      const { data, error: queryError, count } = await query;

      if (signal?.aborted) return;
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
      if (!signal?.aborted) {
        setError(
          err.message ||
            "Bank soal belum berhasil dimuat. Periksa akses database dan relasi tabel."
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
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
    const controller = new AbortController();
    startTransition(() => loadQuestions(controller.signal));
    return () => controller.abort();
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

      const correct = editorForm.options.filter(
        (option) => option.is_correct
      ).length;

      if (correct < 1) {
        return "PG Kompleks harus memiliki minimal satu kunci jawaban.";
      }
    }

    if (selectedQuestion.question_type === "PGK_KATEGORI") {
      if (editorForm.category_items.length < 2) {
        return "PG Kategori harus memiliki minimal dua pernyataan.";
      }

      if (
        editorForm.category_items.some(
          (item) => !item.item_text.trim()
        )
      ) {
        return "Semua pernyataan kategori wajib diisi.";
      }
    }

    if (
      selectedQuestion.question_type !== "PGK_KATEGORI" &&
      editorForm.options.some((option) => !option.option_text.trim())
    ) {
      return "Semua teks pilihan jawaban wajib diisi.";
    }

    return "";
  }

  async function saveEditor() {
    if (!selectedQuestion || !editorForm) return;

    if (!can(PERMISSIONS.edit)) {
      setEditorError("Akun ini tidak memiliki permission bank_soal.edit.");
      return;
    }

    const validationError = validateEditor();

    if (validationError) {
      setEditorError(validationError);
      return;
    }

    setEditorSaving(true);
    setEditorError("");
    setEditorSuccess("");

    try {
      const payload = normalizeEditorPayload(
        editorForm,
        selectedQuestion.question_type
      );

      const { error: saveError } = await supabase.rpc(
        "save_question_revision",
        {
          p_question_id: selectedQuestion.id,
          p_payload: payload,
        }
      );

      if (saveError) throw saveError;

      setEditorSuccess(
        "Revisi soal berhasil disimpan dan menunggu telaah."
      );

      setEditorOpen(false);
      setEditorForm(null);

      await loadQuestions();
    } catch (err) {
      setEditorError(
        err.message || "Gagal menyimpan revisi soal."
      );
    } finally {
      setEditorSaving(false);
    }
  }

  // =====================================================
  // DATA SOAL TERPILIH
  // =====================================================

  const selectedVersion = selectedQuestion
    ? currentVersion(selectedQuestion)
    : null;

  const selectedStimulus =
    selectedVersion?.question_stimuli || null;

  const selectedOptions = (
    selectedVersion?.question_options || []
  )
    .slice()
    .sort((a, b) => a.option_order - b.option_order);

  const selectedCategoryItems = (
    selectedVersion?.question_category_items || []
  )
    .slice()
    .sort((a, b) => a.item_number - b.item_number);

  // =====================================================
  // LOADING AUTENTIKASI
  // =====================================================

  if (!authReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />
          <p className="mt-4 text-sm text-slate-500">
            Memeriksa sesi pengguna...
          </p>
        </div>
      </main>
    );
  }

  // =====================================================
  // HALAMAN LOGIN
  // =====================================================

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div className="mb-7 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-2xl font-black text-white">
              T
            </div>

            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                TKA TryOn
              </h1>
              <p className="text-sm text-slate-500">
                Academic Content Management
              </p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Masuk ke Bank Soal
          </h2>

          <label className="mt-6 block text-sm font-semibold text-slate-700">
            Email
          </label>

          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600"
          />

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Password
          </label>

          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600"
          />

          {authError && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {authLoading ? "Memeriksa..." : "Masuk"}
          </button>
        </form>
      </main>
    );
  }

  // =====================================================
  // AKSES DITOLAK
  // =====================================================

  if (!isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-2xl text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-slate-900">
            Akses Bank Soal Ditolak
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Akun ini belum memiliki permission bank_soal.view. Silakan
            hubungi Super Admin untuk mendapatkan kewenangan.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/admin"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali ke Dashboard
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Keluar
            </button>
          </div>
        </div>
      </main>
    );
  }

  // =====================================================
  // TAMPILAN UTAMA BANK SOAL
  // =====================================================

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        {/* HEADER DAN NAVIGASI */}

        <header className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                <span>⌂</span>
                Dashboard
              </Link>

              {can(PERMISSIONS.import) && (
                <Link
                  href="/admin/import"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <span>⇧</span>
                  Import Center
                </Link>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
                {userRole}
              </span>

              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Keluar
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-blue-700">
              ACADEMIC CONTENT MANAGEMENT
            </p>

            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
              Bank Soal
            </h1>

            <p className="mt-2 text-sm text-slate-500 md:text-base">
              Pusat data soal dan telaah konten akademik TKA TryOn.
            </p>
          </div>
        </header>

        {/* NOTIFIKASI ERROR */}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* STATISTIK */}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500">Total Bank Soal</p>
            <p className="mt-3 text-4xl font-extrabold text-slate-950">
              {totalCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500">Soal pada Halaman Ini</p>
            <p className="mt-3 text-4xl font-extrabold text-blue-700">
              {visibleQuestions.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500">Halaman</p>
            <p className="mt-3 text-4xl font-extrabold text-slate-950">
              {page + 1} / {totalPages}
            </p>
          </div>
        </section>

        {/* PENCARIAN DAN FILTER */}

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
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
              className="text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              Reset Filter
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode, isi soal, materi..."
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600"
            />

            <select
              value={filterLevel}
              onChange={(event) => {
                setFilterLevel(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
            >
              <option value="ALL">Semua Jenjang</option>
              {filterOptions.levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <select
              value={filterGrade}
              onChange={(event) => {
                setFilterGrade(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
            >
              <option value="ALL">Semua Kelas</option>
              {filterOptions.grades.map((grade) => (
                <option key={grade} value={grade}>
                  Kelas {grade}
                </option>
              ))}
            </select>

            <select
              value={filterSubject}
              onChange={(event) => {
                setFilterSubject(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
            >
              <option value="ALL">Semua Mata Pelajaran</option>
              {filterOptions.subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>

            <select
              value={filterType}
              onChange={(event) => {
                setFilterType(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
            >
              <option value="ALL">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_REVIEW">Menunggu Telaah</option>
              <option value="APPROVED">Disetujui</option>
              <option value="PUBLISHED">Terbit</option>
              <option value="NEEDS_REVISION">Perlu Revisi</option>
              <option value="ARCHIVED">Arsip</option>
            </select>
          </div>
        </section>

        {/* DAFTAR SOAL */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Daftar Soal
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Pilih soal untuk membuka detail dan telaah.
              </p>
            </div>

            <button
              onClick={() => loadQuestions()}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Memuat..." : "↻ Muat Ulang"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4">Kode Soal</th>
                  <th className="px-6 py-4">Jenjang / Kelas</th>
                  <th className="px-6 py-4">Mata Pelajaran</th>
                  <th className="px-6 py-4">Tipe</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Tanggal</th>
                  <th className="px-6 py-4">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      Memuat data soal...
                    </td>
                  </tr>
                ) : visibleQuestions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      Tidak ada soal yang sesuai dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  visibleQuestions.map((question) => (
                    <tr
                      key={question.id}
                      className={`transition hover:bg-slate-50 ${
                        selectedQuestion?.id === question.id
                          ? "bg-blue-50"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {question.question_code || "-"}
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {question.education_level_id || "-"}
                        <span className="block text-xs text-slate-400">
                          Kelas {question.grade || "-"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {question.subject_name || "-"}
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {labelType(question.question_type)}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(
                            question.question_status
                          )}`}
                        >
                          {question.question_status || "-"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-slate-500">
                        {formatDate(question.created_at)}
                      </td>

                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedQuestion(question);
                            setShowAnswerKey(false);
                            setEditorOpen(false);
                          }}
                          className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Detail / Telaah
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            <p className="text-sm text-slate-500">
              Menampilkan halaman {page + 1} dari {totalPages}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Sebelumnya
              </button>

              <button
                onClick={() =>
                  setPage((current) =>
                    Math.min(totalPages - 1, current + 1)
                  )
                }
                disabled={page >= totalPages - 1 || loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </section>

        {/* PANEL DETAIL DAN TELAAH */}

        {selectedQuestion && selectedVersion && (
          <section
            ref={reviewPanelRef}
            className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs font-bold tracking-widest text-blue-700">
                  DETAIL DAN TELAAH SOAL
                </p>

                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  {selectedQuestion.question_code || "Detail Soal"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedQuestion.subject_name || "-"} · Kelas{" "}
                  {selectedQuestion.grade || "-"} ·{" "}
                  {labelType(selectedQuestion.question_type)}
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedQuestion(null);
                  setShowAnswerKey(false);
                  setEditorOpen(false);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Tutup Detail
              </button>
            </div>

            {/* METADATA SOAL */}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Elemen", selectedQuestion.element],
                ["Materi", selectedQuestion.material],
                ["Submateri", selectedQuestion.sub_material],
                ["Kompetensi", selectedQuestion.competency],
                ["Indikator", selectedQuestion.indicator],
                ["Level Kognitif", selectedQuestion.cognitive_level],
                ["Kesulitan", selectedQuestion.difficulty],
                ["Kurikulum", selectedQuestion.curriculum_reference],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-slate-50 p-4"
                >
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {value || "-"}
                  </p>
                </div>
              ))}
            </div>

            {/* STIMULUS */}

            {selectedStimulus && (
              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-900">
                    Stimulus
                  </h3>

                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {selectedStimulus.stimulus_type}
                  </span>
                </div>

                {selectedStimulus.title && (
                  <h4 className="mt-3 font-semibold text-slate-800">
                    {selectedStimulus.title}
                  </h4>
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
                    Buka berkas stimulus
                  </a>
                )}

                {selectedStimulus.media_description && (
                  <p className="mt-3 text-sm text-slate-600">
                    Deskripsi media: {selectedStimulus.media_description}
                  </p>
                )}
              </div>
            )}

            {/* PERTANYAAN */}

            <div className="mt-6">
              <h3 className="font-bold text-slate-900">
                Pertanyaan
              </h3>

              {selectedVersion.instruction && (
                <p className="mt-3 text-sm italic text-slate-500">
                  {selectedVersion.instruction}
                </p>
              )}

              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-5 text-sm leading-7 text-slate-800">
                {getQuestionText(selectedQuestion)}
              </div>
            </div>

            {/* PILIHAN JAWABAN */}

            {selectedQuestion.question_type !== "PGK_KATEGORI" && (
              <div className="mt-6">
                <h3 className="font-bold text-slate-900">
                  Pilihan Jawaban
                </h3>

                <div className="mt-3 space-y-3">
                  {selectedOptions.map((option) => (
                    <div
                      key={option.id}
                      className={`rounded-xl border p-4 ${
                        showAnswerKey && option.is_correct
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">
                          {option.option_code}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                            {option.option_text}
                          </p>

                          {showAnswerKey && option.is_correct && (
                            <span className="mt-2 inline-block text-xs font-bold text-emerald-700">
                              ✓ Kunci jawaban
                            </span>
                          )}

                          {showAnswerKey && option.explanation && (
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              {option.explanation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PERNYATAAN KATEGORI */}

            {selectedQuestion.question_type === "PGK_KATEGORI" && (
              <div className="mt-6">
                <h3 className="font-bold text-slate-900">
                  Pernyataan Kategori
                </h3>

                <div className="mt-3 space-y-3">
                  {selectedCategoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <p className="text-sm leading-6 text-slate-800">
                        {item.item_number}. {item.item_text}
                      </p>

                      {showAnswerKey && (
                        <div className="mt-2 text-xs font-semibold text-emerald-700">
                          Jawaban: {item.correct_category}
                        </div>
                      )}

                      {showAnswerKey && item.explanation && (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {item.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PEMBAHASAN */}

            {showAnswerKey && selectedVersion.explanation && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-bold text-amber-900">
                  Pembahasan
                </h3>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-amber-900">
                  {selectedVersion.explanation}
                </p>
              </div>
            )}

            {/* AKSI TELAAH */}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
              <button
                onClick={() => setShowAnswerKey((value) => !value)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showAnswerKey
                  ? "Sembunyikan Kunci dan Pembahasan"
                  : "Tampilkan Kunci dan Pembahasan"}
              </button>

              {can(PERMISSIONS.edit) && (
                <button
                  onClick={openEditor}
                  className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Edit / Revisi Soal
                </button>
              )}
            </div>

            {/* EDITOR */}

            {editorOpen && editorForm && (
              <div className="mt-7 rounded-2xl border border-blue-200 bg-blue-50/30 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Editor Revisi Soal
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Perubahan disimpan sebagai versi baru untuk ditelaah.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setEditorOpen(false);
                      setEditorForm(null);
                      setEditorError("");
                      setEditorSuccess("");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Tutup Editor
                  </button>
                </div>

                {editorError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {editorError}
                  </div>
                )}

                {editorSuccess && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {editorSuccess}
                  </div>
                )}

                {/* INSTRUKSI */}

                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Instruksi
                </label>

                <textarea
                  value={editorForm.instruction}
                  onChange={(event) =>
                    updateEditorField("instruction", event.target.value)
                  }
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600"
                />

                {/* PERTANYAAN */}

                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Teks Pertanyaan
                </label>

                <textarea
                  value={editorForm.question_text}
                  onChange={(event) =>
                    updateEditorField("question_text", event.target.value)
                  }
                  rows={6}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-blue-600"
                />

                {/* STIMULUS */}

                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                  <label className="flex items-center gap-3 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editorForm.stimulus.enabled}
                      onChange={(event) =>
                        updateStimulusField(
                          "enabled",
                          event.target.checked
                        )
                      }
                      className="h-4 w-4 accent-blue-700"
                    />
                    Gunakan Stimulus
                  </label>

                  {editorForm.stimulus.enabled && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
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
                          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        >
                          {STIMULUS_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
                          Judul Stimulus
                        </label>

                        <input
                          value={editorForm.stimulus.title}
                          onChange={(event) =>
                            updateStimulusField("title", event.target.value)
                          }
                          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600">
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
                          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm leading-6"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
                          URL Berkas
                        </label>

                        <input
                          value={editorForm.stimulus.file_url}
                          onChange={(event) =>
                            updateStimulusField("file_url", event.target.value)
                          }
                          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
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
                          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        >
                          {USAGE_RIGHTS.map((right) => (
                            <option key={right} value={right}>
                              {right}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600">
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
                          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600">
                          Referensi Sumber
                        </label>

                        <input
                          value={editorForm.stimulus.source_reference}
                          onChange={(event) =>
                            updateStimulusField(
                              "source_reference",
                              event.target.value
                            )
                          }
                          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* PILIHAN JAWABAN */}

                {selectedQuestion.question_type !== "PGK_KATEGORI" && (
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="font-bold text-slate-800">
                        Pilihan Jawaban
                      </h4>

                      <button
                        onClick={addOption}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        + Tambah Opsi
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {editorForm.options.map((option, index) => (
                        <div
                          key={index}
                          className="rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                            <div className="md:col-span-2">
                              <label className="text-xs font-semibold text-slate-500">
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
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="md:col-span-8">
                              <label className="text-xs font-semibold text-slate-500">
                                Teks Jawaban
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
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="flex items-end md:col-span-2">
                              <button
                                onClick={() => removeOption(index)}
                                className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Hapus
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={option.is_correct}
                                onChange={(event) =>
                                  updateOption(
                                    index,
                                    "is_correct",
                                    event.target.checked
                                  )
                                }
                                className="h-4 w-4 accent-blue-700"
                              />
                              Kunci Jawaban
                            </label>

                            <div className="min-w-[200px] flex-1">
                              <input
                                value={option.explanation}
                                onChange={(event) =>
                                  updateOption(
                                    index,
                                    "explanation",
                                    event.target.value
                                  )
                                }
                                placeholder="Pembahasan opsi (opsional)"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PERNYATAAN KATEGORI */}

                {selectedQuestion.question_type === "PGK_KATEGORI" && (
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="font-bold text-slate-800">
                        Pernyataan Kategori
                      </h4>

                      <button
                        onClick={addCategoryItem}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        + Tambah Pernyataan
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {editorForm.category_items.map((item, index) => (
                        <div
                          key={index}
                          className="rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-bold text-slate-700">
                              Pernyataan {index + 1}
                            </p>

                            <button
                              onClick={() => removeCategoryItem(index)}
                              className="text-xs font-semibold text-red-600 hover:underline"
                            >
                              Hapus
                            </button>
                          </div>

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
                            placeholder="Tulis pernyataan..."
                            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                          />

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="text-xs font-semibold text-slate-500">
                                Kategori Jawaban
                              </label>

                              <input
                                value={item.category_label}
                                onChange={(event) =>
                                  updateCategoryItem(
                                    index,
                                    "category_label",
                                    event.target.value
                                  )
                                }
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-slate-500">
                                Kunci Jawaban
                              </label>

                              <select
                                value={item.correct_category}
                                onChange={(event) =>
                                  updateCategoryItem(
                                    index,
                                    "correct_category",
                                    event.target.value
                                  )
                                }
                                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                              >
                                <option value="BENAR">BENAR</option>
                                <option value="SALAH">SALAH</option>
                              </select>
                            </div>
                          </div>

                          <input
                            value={item.explanation}
                            onChange={(event) =>
                              updateCategoryItem(
                                index,
                                "explanation",
                                event.target.value
                              )
                            }
                            placeholder="Pembahasan pernyataan (opsional)"
                            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PEMBAHASAN UMUM */}

                <label className="mt-6 block text-sm font-semibold text-slate-700">
                  Pembahasan Umum
                </label>

                <textarea
                  rows={5}
                  value={editorForm.explanation}
                  onChange={(event) =>
                    updateEditorField("explanation", event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm leading-6"
                />

                {/* SIMPAN REVISI */}

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={saveEditor}
                    disabled={editorSaving}
                    className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {editorSaving
                      ? "Menyimpan Revisi..."
                      : "Simpan Revisi"}
                  </button>

                  <button
                    onClick={() => {
                      setEditorOpen(false);
                      setEditorForm(null);
                    }}
                    disabled={editorSaving}
                    className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* FOOTER */}

        <footer className="border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
          TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>
      </div>
    </main>
  );
}
