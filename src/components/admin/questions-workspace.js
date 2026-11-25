
"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandLogo from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const LIST_STATE_KEY = "tka-question-list-state";

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
  moderate: "bank_soal.moderate",
  publish: "bank_soal.publish",
  import: "bank_soal.import",
  archive: "bank_soal.archive",
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

  if (value === "PUBLISHED") return "bg-success-tint text-success-ink";
  if (value === "DRAFT") return "bg-warning-tint text-warning-ink";
  if (value === "REVIEW" || value === "PENDING_REVIEW")
    return "bg-accent-tint text-accent-ink";
  if (value === "REJECTED" || value === "NEEDS_REVISION")
    return "bg-danger-tint text-danger-ink";

  return "bg-surface-raised text-ink-secondary";
}

function currentVersion(question) {
  const versions = [...(question?.question_versions || [])];

  // The admin workspace reviews the latest revision, not just the published one.
  return versions.sort((a, b) => b.version_number - a.version_number)[0] || null;
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

export default function QuestionsWorkspace({ questionId = null }) {
  const detailOnly = questionId !== null;
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
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [catalog, setCatalog] = useState([]);
  const [listReady, setListReady] = useState(false);
  const restoreScroll = useRef(null);

  // Persist only UI state, never question content or credentials.
  useEffect(() => {
    if (detailOnly) return;
    window.name = "tka-question-list";
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(LIST_STATE_KEY)); } catch { /* Storage may be unavailable. */ }
    startTransition(() => {
      if (saved && typeof saved === "object") {
        if (typeof saved.search === "string") setSearch(saved.search);
        if (typeof saved.level === "string") setFilterLevel(saved.level);
        if (typeof saved.grade === "string") setFilterGrade(saved.grade);
        if (typeof saved.subject === "string") setFilterSubject(saved.subject);
        if (typeof saved.status === "string") setFilterStatus(saved.status);
        if (PAGE_SIZE_OPTIONS.includes(saved.pageSize)) setPageSize(saved.pageSize);
        if (Number.isSafeInteger(saved.page) && saved.page >= 0) setPage(saved.page);
        if (Number.isFinite(saved.scrollY)) restoreScroll.current = Math.max(0, saved.scrollY);
      }
      setListReady(true);
    });
  }, [detailOnly]);

  useEffect(() => {
    if (detailOnly || !listReady) return;
    const persist = () => {
      try {
        sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify({
          search, level: filterLevel, grade: filterGrade, subject: filterSubject,
          status: filterStatus, page, pageSize, scrollY: window.scrollY,
        }));
      } catch { /* Navigation still works when storage is disabled. */ }
    };
    persist();
    window.addEventListener("scroll", persist, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("scroll", persist);
      window.removeEventListener("pagehide", persist);
    };
  }, [detailOnly, listReady, search, filterLevel, filterGrade, filterSubject, filterStatus, page, pageSize]);

  const [showAnswerKey, setShowAnswerKey] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorForm, setEditorForm] = useState(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [editorSuccess, setEditorSuccess] = useState("");
  const [workflowNotes, setWorkflowNotes] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const archiveDialog = useRef(null);
  const archiveInFlight = useRef(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiveMessage, setArchiveMessage] = useState("");

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

    // Operator diperiksa melalui permission RPC.
    const requestedPermissions = Object.values(PERMISSIONS);

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
    setUserRole(superAdmin ? "Super Admin" : "Admin Operator");
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

      setAuthReady(false);
      setSession(newSession);
      setSelectedQuestion(null);
      archiveDialog.current?.close();
      setArchiveTarget(null);
      setArchiveReason("");
      setArchiveMessage("");
      setEditorOpen(false);
      setEditorForm(null);
      setShowAnswerKey(false);
      setIsAdmin(false);
      setPermissions([]);

      if (!newSession) {
        setIsAdmin(false);
        setPermissions([]);
        setUserRole("");
        setQuestions([]);
        setSelectedQuestion(null);
        setAuthReady(true);
      } else {
        // Jangan menunggu RPC di callback internal autentikasi Supabase.
        setTimeout(async () => {
          if (!alive) return;
          await verifyAccess(newSession);
          if (alive) setAuthReady(true);
        }, 0);
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
    if (!authReady || !session || !isAdmin || !can(PERMISSIONS.view)) return;
    if (!detailOnly && !listReady) return;

    setLoading(true);
    setError("");

    try {
      if (detailOnly) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) {
          setSelectedQuestion(null);
          setError("ID soal tidak valid.");
          return;
        }
        let detailQuery = supabase.from("questions")
          .select(QUESTION_SELECT).eq("id", questionId);
        if (signal) detailQuery = detailQuery.abortSignal(signal);
        const { data, error: detailError } = await detailQuery.maybeSingle();
        if (signal?.aborted) return;
        if (detailError) throw detailError;
        setSelectedQuestion(data || null);
        if (!data) setError("Soal tidak ditemukan atau tidak dapat diakses.");
        else if (!currentVersion(data)) setError("Versi soal belum tersedia.");
        return;
      }
      const from = page * pageSize;
      const to = from + pageSize - 1;

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

      if (filterStatus !== "ALL") {
        query = query.eq("question_status", filterStatus);
      }

      if (signal) query = query.abortSignal(signal);
      const { data, error: queryError, count } = await query;

      if (signal?.aborted) return;
      if (queryError) throw queryError;

      const lastPage = Math.max(0, Math.ceil((count || 0) / pageSize) - 1);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setQuestions(data || []);
      setTotalCount(count || 0);
      if (restoreScroll.current !== null) {
        const scrollY = restoreScroll.current;
        restoreScroll.current = null;
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" }));
      }

      setSelectedQuestion((previous) => {
        if (!previous) return null;

        return (
          (data || []).find((item) => item.id === previous.id) || null
        );
      });
    } catch (err) {
      if (!signal?.aborted) {
        if (detailOnly) setSelectedQuestion(null);
        setError(
          err.message ||
            "Bank soal belum berhasil dimuat. Periksa akses database dan relasi tabel."
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [
    authReady,
    session,
    isAdmin,
    can,
    detailOnly,
    questionId,
    listReady,
    page,
    pageSize,
    filterLevel,
    filterGrade,
    filterSubject,
    filterStatus,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    startTransition(() => loadQuestions(controller.signal));
    return () => controller.abort();
  }, [loadQuestions]);

  // Read the filter catalog independently of the active page, respecting RLS.
  useEffect(() => {
    if (detailOnly || !authReady || !session || !can(PERMISSIONS.view)) return;
    const controller = new AbortController();
    async function loadCatalog() {
      const rows = [];
      for (let from = 0; ; from += 500) {
        const { data, error: catalogError } = await supabase.from("questions")
          .select("id,education_level_id,grade,subject_name")
          .order("id").range(from, from + 499).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (catalogError) {
          setError("Pilihan filter belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.");
          return;
        }
        rows.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      setCatalog(rows);
    }
    loadCatalog();
    return () => controller.abort();
  }, [detailOnly, authReady, session, can]);

  // =====================================================
  // FILTER DAN PENCARIAN
  // =====================================================

  const filterOptions = useMemo(() => {
    const unique = (values) =>
      [...new Set(values.filter(Boolean))].sort();

    return {
      subjects: unique(catalog.map((q) => q.subject_name)),
      levels: unique(catalog.map((q) => q.education_level_id)),
      grades: unique(catalog.filter((q) => q.grade != null).map((q) => String(q.grade))),
    };
  }, [catalog]);

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
        question.sub_material,
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
    Math.ceil(totalCount / pageSize)
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

  function openArchive(question) {
    if (!can(PERMISSIONS.archive) || question.question_status === "ARCHIVED" || archiveInFlight.current) return;
    setArchiveTarget(question);
    setArchiveReason("");
    setArchiveError("");
    setArchiveMessage("");
    archiveDialog.current?.showModal();
  }

  async function handleArchive(event) {
    event.preventDefault();
    if (archiveInFlight.current || !archiveTarget || !can(PERMISSIONS.archive)) return;
    const version = currentVersion(archiveTarget);
    if (!version || archiveReason.trim().length < 5 || archiveReason.trim().length > 2000) {
      setArchiveError("Isi alasan pengarsipan 5–2000 karakter.");
      return;
    }
    archiveInFlight.current = true;
    setArchiveBusy(true);
    setArchiveError("");
    try {
      const { data, error: archiveFailure } = await supabase.rpc("archive_question", {
        p_question_id: archiveTarget.id,
        p_expected_status: archiveTarget.question_status,
        p_expected_version_id: version.id,
        p_reason: archiveReason.trim(),
      });
      if (archiveFailure) throw archiveFailure;
      if (!data?.success || data.question_status !== "ARCHIVED") throw new Error("Pengarsipan belum dikonfirmasi server.");
      archiveDialog.current?.close();
      setArchiveTarget(null);
      setArchiveReason("");
      setArchiveMessage("Soal berhasil diarsipkan. Isi dan riwayat tetap tersimpan.");
      await loadQuestions();
    } catch (err) {
      setArchiveError(err.message || "Pengarsipan gagal. Muat ulang dan periksa izinmu.");
    } finally {
      archiveInFlight.current = false;
      setArchiveBusy(false);
    }
  }

  async function handleWorkflow(action) {
    const version = currentVersion(selectedQuestion);
    if (!version || workflowBusy) return;
    const required = action === "REVIEW" ? PERMISSIONS.review
      : action === "PUBLISH" ? PERMISSIONS.publish : PERMISSIONS.moderate;
    if (!can(required)) return;
    if (workflowNotes.trim().length < 5) {
      setWorkflowMessage("Isi catatan pemeriksaan minimal 5 karakter.");
      return;
    }
    if (!window.confirm(`Jalankan tindakan ${action} untuk versi ${version.version_number}?`)) return;
    setWorkflowBusy(true);
    setWorkflowMessage("");
    try {
      const { data, error: actionError } = await supabase.rpc("review_question_version", {
        p_question_id: selectedQuestion.id,
        p_version_id: version.id,
        p_action: action,
        p_notes: workflowNotes.trim(),
      });
      if (actionError) throw actionError;
      if (!data?.success) throw new Error("Tindakan belum dikonfirmasi server.");
      setWorkflowMessage(`Tindakan berhasil. Status versi: ${data.version_status}.`);
      setWorkflowNotes("");
      await loadQuestions();
    } catch (err) {
      setWorkflowMessage(err.message || "Tindakan gagal. Muat ulang dan periksa izinmu.");
    } finally {
      setWorkflowBusy(false);
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
      <main className="grid min-h-screen place-items-center bg-surface-muted">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-accent-line border-t-accent" />
          <p className="mt-4 text-sm text-ink-muted">
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
      <main className="grid min-h-screen place-items-center bg-surface-muted p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm"
        >
          <div className="mb-7 flex items-center gap-4">
            <BrandLogo className="h-16 w-16" />

            <div>
              <h1 className="text-2xl font-extrabold text-ink">
                TKA TryOn
              </h1>
              <p className="text-sm text-ink-muted">
                Academic Content Management
              </p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-ink">
            Masuk ke Bank Soal
          </h2>

          <label className="mt-6 block text-sm font-semibold text-ink-body">
            Email
          </label>

          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-lg border border-line-strong px-4 py-3 text-sm outline-none focus:border-accent"
          />

          <label className="mt-5 block text-sm font-semibold text-ink-body">
            Password
          </label>

          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-lg border border-line-strong px-4 py-3 text-sm outline-none focus:border-accent"
          />

          {authError && (
            <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-bold text-on-primary hover:bg-primary-hover disabled:opacity-50"
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
      <main className="grid min-h-screen place-items-center bg-surface-muted p-5">
        <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-2xl text-danger-ink">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-ink">
            Akses Bank Soal Ditolak
          </h1>

          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Akun ini belum memiliki permission bank_soal.view. Silakan
            hubungi Super Admin untuk mendapatkan kewenangan.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/admin"
              className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-semibold text-ink-body hover:bg-surface-muted"
            >
              Kembali ke Dashboard
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
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
    <main className="min-h-screen bg-surface-muted px-5 py-8 text-ink md:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        {detailOnly && (
          <header className="space-y-3">
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{"Bank Soal >> Detail Soal"}</h1>
            <p className="text-sm text-ink-muted">Ruang telaah soal · {userRole}. Daftar Bank Soal tetap tersedia di tab asal.</p>
            <a href="/admin/questions" target="tka-question-list" className="inline-flex rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft">← Kembali ke Bank Soal</a>
            <button onClick={() => loadQuestions()} disabled={loading} className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50">Muat Ulang Detail</button>
            <div role="status" aria-live="polite">
              {loading && <p className="text-sm text-ink-muted">Memuat detail soal...</p>}
              {error && <p className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>}
            </div>
          </header>
        )}

        {!detailOnly && (<>
        {/* HEADER DAN NAVIGASI */}

        <header className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-semibold text-ink-body transition hover:border-accent hover:bg-accent-soft hover:text-accent-ink"
              >
                <span>⌂</span>
                Dashboard
              </Link>

              {can(PERMISSIONS.import) && (
                <Link
                  href="/admin/import"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-semibold text-ink-body transition hover:border-accent hover:bg-accent-soft hover:text-accent-ink"
                >
                  <span>⇧</span>
                  Import Center
                </Link>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-success-tint px-4 py-2 text-sm font-semibold text-success-ink">
                {userRole}
              </span>

              <button
                onClick={handleLogout}
                className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink-body transition hover:bg-surface-raised"
              >
                Keluar
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-accent-ink">
              ACADEMIC CONTENT MANAGEMENT
            </p>

            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              Bank Soal
            </h1>

            <p className="mt-2 text-sm text-ink-muted md:text-base">
              Pusat data soal dan telaah konten akademik TKA TryOn.
            </p>
          </div>
        </header>

        {/* NOTIFIKASI ERROR */}

        {error && (
          <div className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">
            {error}
          </div>
        )}

        {/* PENCARIAN DAN FILTER */}

        <section className="rounded-2xl border border-line bg-surface p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">
              Pencarian dan Filter
            </h2>

            <button
              onClick={() => {
                setSearch("");
                setFilterLevel("ALL");
                setFilterGrade("ALL");
                setFilterSubject("ALL");
                setFilterStatus("ALL");
                setPage(0);
              }}
              className="text-sm font-semibold text-accent-ink hover:text-accent-strong"
            >
              Reset Filter
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              type="text"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              aria-label="Cari soal pada halaman ini"
              placeholder="Cari di halaman ini: kode, isi, materi..."
              className="w-full rounded-lg border border-line-strong px-4 py-3 text-sm outline-none focus:border-accent"
            />

            <select
              aria-label="Jenjang"
              value={filterLevel}
              onChange={(event) => {
                setFilterLevel(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            >
              <option value="ALL">Semua Jenjang</option>
              {filterOptions.levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <select
              aria-label="Kelas"
              value={filterGrade}
              onChange={(event) => {
                setFilterGrade(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            >
              <option value="ALL">Semua Kelas</option>
              {filterOptions.grades.map((grade) => (
                <option key={grade} value={grade}>
                  Kelas {grade}
                </option>
              ))}
            </select>

            <select
              aria-label="Mata Pelajaran"
              value={filterSubject}
              onChange={(event) => {
                setFilterSubject(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            >
              <option value="ALL">Semua Mata Pelajaran</option>
              {filterOptions.subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>

            <select
              aria-label="Status"
              value={filterStatus}
              onChange={(event) => {
                setFilterStatus(event.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
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

        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-6">
            <div>
              <h2 className="text-lg font-bold text-ink">
                Daftar Soal
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Pilih soal untuk membuka detail dan telaah.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
                Soal per halaman
                <select
                  value={pageSize}
                  onChange={(event) => {
                    const size = Number(event.target.value);
                    if (!PAGE_SIZE_OPTIONS.includes(size)) return;
                    setPageSize(size);
                    setPage(0);
                  }}
                  className="min-h-10 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-line"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => loadQuestions()}
                disabled={loading}
                className="min-h-10 rounded-lg border border-line-strong px-4 py-2.5 text-sm font-semibold text-ink-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                {loading ? "Memuat..." : "↻ Muat Ulang"}
              </button>
              {can(PERMISSIONS.import) ? (
                <Link
                  href="/admin/import"
                  title="Tambahkan soal melalui Import Center"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  + Tambah Soal Baru
                </Link>
              ) : (
                <button
                  disabled
                  title="Izin Import Soal diperlukan untuk menambahkan soal melalui Import Center."
                  className="min-h-10 cursor-not-allowed rounded-lg bg-surface-raised px-4 py-2.5 text-sm font-semibold text-ink-muted"
                >
                  + Tambah Soal Baru
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-6 py-4">Kode Soal</th>
                  <th className="px-6 py-4">Jenjang / Kelas</th>
                  <th className="px-6 py-4">Mata Pelajaran</th>
                  <th className="px-6 py-4">Tipe</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Materi / Topik</th>
                  <th className="px-6 py-4">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-line-subtle">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-ink-muted"
                    >
                      Memuat data soal...
                    </td>
                  </tr>
                ) : visibleQuestions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-ink-muted"
                    >
                      Tidak ada soal yang sesuai dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  visibleQuestions.map((question) => (
                    <tr
                      key={question.id}
                      className={`transition hover:bg-surface-muted ${
                        selectedQuestion?.id === question.id
                          ? "bg-accent-soft"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-semibold text-ink">
                        {question.question_code || "-"}
                      </td>

                      <td className="px-6 py-4 text-ink-secondary">
                        {question.education_level_id || "-"}
                        <span className="block text-xs text-ink-muted">
                          Kelas {question.grade || "-"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-ink-secondary">
                        {question.subject_name || "-"}
                      </td>

                      <td className="px-6 py-4 text-ink-secondary">
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

                      <td className="max-w-64 px-6 py-4 text-ink-secondary">
                        <span className="block break-words">{question.material?.trim() || "—"}</span>
                        <span className="mt-1 block break-words text-xs text-ink-muted">
                          {question.sub_material?.trim() || "—"}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`/admin/questions/detail?id=${encodeURIComponent(question.id)}`}
                            target="tka-question-detail"
                            aria-label={`Detail / Telaah ${question.question_code || "soal"} (tab terpisah)`}
                            className="min-h-9 whitespace-nowrap rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            Detail / Telaah
                          </a>
                          <button
                            onClick={() => openArchive(question)}
                            disabled={!can(PERMISSIONS.archive) || question.question_status === "ARCHIVED" || archiveBusy || loading}
                            aria-label={`Arsipkan ${question.question_code || "soal"}`}
                            aria-describedby="question-archive-help"
                            title={!can(PERMISSIONS.archive) ? "Izin arsip soal diperlukan." : "Arsipkan tanpa menghapus isi dan riwayat soal."}
                            className="min-h-9 rounded-lg border border-warning-line px-3 py-2 text-xs font-semibold text-warning-ink hover:bg-warning-soft disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {question.question_status === "ARCHIVED" ? "Diarsipkan" : "Arsipkan"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
            <p className="text-sm text-ink-muted" role="status" aria-live="polite">
              {loading ? "Memuat soal..." : <><span className="font-semibold text-ink">{visibleQuestions.length}</span> soal pada halaman ini</>}
              <span className="mx-2 text-inverse-muted" aria-hidden="true">·</span>
              Halaman <span className="font-semibold text-ink">{page + 1}</span> dari {totalPages}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || loading}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-ink-body disabled:opacity-40"
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
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-ink-body disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
          <div className="space-y-1 border-t border-line-subtle bg-surface-muted/70 px-6 py-3 text-xs leading-relaxed text-ink-muted">
            <p>Detail / Telaah dibuka pada satu tab terpisah yang digunakan kembali untuk soal berikutnya.</p>
            <p>Tambah Soal Baru menggunakan Import Center. Pencarian berlaku pada halaman yang sedang ditampilkan.</p>
            <p id="question-archive-help">Arsipkan memerlukan izin khusus dan alasan. Soal terkait attempt, jawaban, atau assignment akan ditolak. Isi serta riwayat tidak dihapus.</p>
            {archiveMessage && <p role="status" className="font-semibold text-success-ink">{archiveMessage}</p>}
          </div>
        </section>

        </>)}

        <dialog ref={archiveDialog} aria-labelledby="archive-title" aria-describedby="archive-description"
          onCancel={(event) => { if (archiveBusy) event.preventDefault(); }}
          className="fixed inset-0 m-auto w-full max-w-lg rounded-2xl p-6 shadow-xl backdrop:bg-inverse/50">
          <form onSubmit={handleArchive}>
            <h2 id="archive-title" className="text-lg font-bold">Arsipkan {archiveTarget?.question_code || "soal"}?</h2>
            <p id="archive-description" className="mt-3 text-sm text-ink-secondary">
              Soal tidak akan tersedia untuk penggunaan baru. Isi, versi, dan riwayat tetap tersimpan.
              Server menolak soal yang terkait attempt, jawaban, atau assignment. Tidak tersedia pemulihan melalui halaman ini.
            </p>
            <label className="mt-4 block text-sm font-semibold">
              Alasan pengarsipan (5–2000 karakter)
              <textarea autoFocus required minLength={5} maxLength={2000} rows={4} value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)} disabled={archiveBusy}
                className="mt-2 w-full rounded-lg border border-line-strong p-3 font-normal" />
            </label>
            {archiveError && <p role="alert" className="mt-3 text-sm text-danger-ink">{archiveError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={archiveBusy} onClick={() => archiveDialog.current?.close()}
                className="rounded-lg border px-4 py-2 disabled:opacity-50">Batal</button>
              <button type="submit" disabled={archiveBusy || archiveReason.trim().length < 5 || !can(PERMISSIONS.archive)}
                className="rounded-lg bg-warning px-4 py-2 font-semibold text-on-inverse disabled:opacity-50">
                {archiveBusy ? "Mengarsipkan..." : "Ya, arsipkan soal"}
              </button>
            </div>
          </form>
        </dialog>

        {/* PANEL DETAIL DAN TELAAH */}

        {detailOnly && selectedQuestion && selectedVersion && (
          <section
            ref={reviewPanelRef}
            className="scroll-mt-6 rounded-2xl border border-line bg-surface p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-subtle pb-5">
              <div>
                <p className="text-xs font-bold tracking-widest text-accent-ink">
                  DETAIL DAN TELAAH SOAL
                </p>

                <h2 className="mt-2 text-xl font-bold text-ink">
                  {selectedQuestion.question_code || "Detail Soal"}
                </h2>

                <p className="mt-1 text-sm text-ink-muted">
                  {selectedQuestion.subject_name || "-"} · Kelas{" "}
                  {selectedQuestion.grade || "-"} ·{" "}
                  {labelType(selectedQuestion.question_type)}
                </p>
              </div>

              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(selectedQuestion.question_status)}`}>
                {selectedQuestion.question_status || "-"}
              </span>
            </div>

            {/* METADATA SOAL */}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ["Materi", selectedQuestion.material],
                ["Topik", selectedQuestion.sub_material],
                ["Status", selectedQuestion.question_status],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-surface-muted p-4"
                >
                  <p className="text-xs text-ink-muted">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-ink-body">
                    {value || "—"}
                  </p>
                </div>
              ))}
            </div>

            <details className="mt-4 rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink-secondary">Informasi pendukung telaah</summary>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Status Versi", selectedVersion.version_status],
                  ["Versi", selectedVersion.version_number],
                  ["Elemen", selectedQuestion.element],
                  ["Kompetensi", selectedQuestion.competency],
                  ["Indikator", selectedQuestion.indicator],
                  ["Level Kognitif", selectedQuestion.cognitive_level],
                  ["Kesulitan", selectedQuestion.difficulty],
                  ["Kurikulum", selectedQuestion.curriculum_reference],
                  ["Sumber", selectedQuestion.source_reference],
                  ["Hak penggunaan", selectedQuestion.usage_rights],
                ].map(([label, value]) => <div key={label}><dt className="text-ink-muted">{label}</dt><dd className="whitespace-pre-wrap text-ink-body">{value || "—"}</dd></div>)}
              </dl>
            </details>

            {/* STIMULUS */}

            {selectedStimulus && (
              <div className="mt-6 rounded-xl border border-accent-line bg-accent-soft/50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-ink">
                    Stimulus
                  </h3>

                  <span className="rounded-full bg-accent-tint px-3 py-1 text-xs font-semibold text-accent-ink">
                    {selectedStimulus.stimulus_type}
                  </span>
                </div>

                {selectedStimulus.title && (
                  <h4 className="mt-3 font-semibold text-ink-body">
                    {selectedStimulus.title}
                  </h4>
                )}

                {selectedStimulus.content_text && (
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-body">
                    {selectedStimulus.content_text}
                  </div>
                )}

                {selectedStimulus.file_url && (
                  <a
                    href={selectedStimulus.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm font-semibold text-accent-ink underline"
                  >
                    Buka berkas stimulus
                  </a>
                )}

                {selectedStimulus.media_description && (
                  <p className="mt-3 text-sm text-ink-secondary">
                    Deskripsi media: {selectedStimulus.media_description}
                  </p>
                )}
              </div>
            )}

            {/* PERTANYAAN */}

            <div className="mt-6">
              <h3 className="font-bold text-ink">
                Pertanyaan
              </h3>

              {selectedVersion.instruction && (
                <p className="mt-3 text-sm italic text-ink-muted">
                  {selectedVersion.instruction}
                </p>
              )}

              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-muted p-5 text-sm leading-7 text-ink-body">
                {getQuestionText(selectedQuestion)}
              </div>
            </div>

            {/* PILIHAN JAWABAN */}

            {selectedQuestion.question_type !== "PGK_KATEGORI" && (
              <div className="mt-6">
                <h3 className="font-bold text-ink">
                  Pilihan Jawaban
                </h3>

                <div className="mt-3 space-y-3">
                  {selectedOptions.map((option) => (
                    <div
                      key={option.id}
                      className={`rounded-xl border p-4 ${
                        showAnswerKey && option.is_correct
                          ? "border-success-line bg-success-soft"
                          : "border-line bg-surface"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-raised text-sm font-bold text-ink-body">
                          {option.option_code}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-ink-body">
                            {option.option_text}
                          </p>

                          {showAnswerKey && option.is_correct && (
                            <span className="mt-2 inline-block text-xs font-bold text-success-ink">
                              ✓ Kunci jawaban
                            </span>
                          )}

                          {showAnswerKey && option.explanation && (
                            <p className="mt-2 text-xs leading-5 text-ink-muted">
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
                <h3 className="font-bold text-ink">
                  Pernyataan Kategori
                </h3>

                <div className="mt-3 space-y-3">
                  {selectedCategoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-line p-4"
                    >
                      <p className="text-sm leading-6 text-ink-body">
                        {item.item_number}. {item.item_text}
                      </p>

                      {showAnswerKey && (
                        <div className="mt-2 text-xs font-semibold text-success-ink">
                          Jawaban: {item.correct_category}
                        </div>
                      )}

                      {showAnswerKey && item.explanation && (
                        <p className="mt-2 text-xs leading-5 text-ink-muted">
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
              <div className="mt-6 rounded-xl border border-warning-line bg-warning-soft p-5">
                <h3 className="font-bold text-warning-ink">
                  Pembahasan
                </h3>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-warning-ink">
                  {selectedVersion.explanation}
                </p>
              </div>
            )}

            {/* AKSI TELAAH */}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-line-subtle pt-5">
              <button
                onClick={() => setShowAnswerKey((value) => !value)}
                className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-semibold text-ink-body hover:bg-surface-muted"
              >
                {showAnswerKey
                  ? "Sembunyikan Kunci dan Pembahasan"
                  : "Tampilkan Kunci dan Pembahasan"}
              </button>

              {can(PERMISSIONS.edit) && selectedQuestion.question_status !== "ARCHIVED" && (
                <button
                  onClick={openEditor}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                >
                  Edit / Revisi Soal
                </button>
              )}
            </div>

            <div key={selectedVersion.id} className="mt-6 rounded-xl border border-line bg-surface-muted p-5">
              <h3 className="font-bold text-ink">Telaah, moderasi, dan publikasi</h3>
              <p className="mt-2 text-sm text-ink-secondary">
                Versi terbaru: {selectedVersion.version_number} · {selectedVersion.version_status}.
                Versi harus ditelaah lalu disetujui sebelum diterbitkan. Revisi tidak otomatis mengganti versi terbit.
              </p>
              <label className="mt-4 block text-sm font-semibold text-ink-body">
                Catatan pemeriksaan
                <textarea value={workflowNotes} onChange={(event) => setWorkflowNotes(event.target.value)}
                  maxLength={4000} rows={3} disabled={workflowBusy}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-surface p-3 font-normal" />
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                {[
                  ["REVIEW", "Simpan telaah", PERMISSIONS.review, ["DRAFT", "PENDING_REVIEW", "NEEDS_REVISION"]],
                  ["REQUEST_REVISION", "Minta revisi", PERMISSIONS.moderate, ["DRAFT", "PENDING_REVIEW"]],
                  ["APPROVE", "Setujui versi", PERMISSIONS.moderate, ["DRAFT", "PENDING_REVIEW"]],
                  ["PUBLISH", "Terbitkan soal", PERMISSIONS.publish, ["APPROVED"]],
                ].filter(([, , permission, statuses]) => selectedQuestion.question_status !== "ARCHIVED" && can(permission) && statuses.includes(selectedVersion.version_status))
                  .map(([action, label]) => (
                    <button key={action} onClick={() => handleWorkflow(action)} disabled={workflowBusy}
                      className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">
                      {label}
                    </button>
                  ))}
              </div>
              {workflowMessage && <p role="status" className="mt-3 text-sm text-ink-body">{workflowMessage}</p>}
            </div>

            {/* EDITOR */}

            {editorOpen && editorForm && (
              <div className="mt-7 rounded-2xl border border-accent-line bg-accent-soft/30 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-ink">
                      Editor Revisi Soal
                    </h3>

                    <p className="mt-1 text-xs text-ink-muted">
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
                    className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-secondary hover:bg-surface-muted"
                  >
                    Tutup Editor
                  </button>
                </div>

                {editorError && (
                  <div className="mt-4 rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink">
                    {editorError}
                  </div>
                )}

                {editorSuccess && (
                  <div className="mt-4 rounded-lg border border-success-line bg-success-soft p-3 text-sm text-success-ink">
                    {editorSuccess}
                  </div>
                )}

                {/* INSTRUKSI */}

                <label className="mt-5 block text-sm font-semibold text-ink-body">
                  Instruksi
                </label>

                <textarea
                  value={editorForm.instruction}
                  onChange={(event) =>
                    updateEditorField("instruction", event.target.value)
                  }
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />

                {/* PERTANYAAN */}

                <label className="mt-5 block text-sm font-semibold text-ink-body">
                  Teks Pertanyaan
                </label>

                <textarea
                  value={editorForm.question_text}
                  onChange={(event) =>
                    updateEditorField("question_text", event.target.value)
                  }
                  rows={6}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm leading-6 outline-none focus:border-accent"
                />

                {/* STIMULUS */}

                <div className="mt-6 rounded-xl border border-line bg-surface p-4">
                  <label className="flex items-center gap-3 text-sm font-bold text-ink-body">
                    <input
                      type="checkbox"
                      checked={editorForm.stimulus.enabled}
                      onChange={(event) =>
                        updateStimulusField(
                          "enabled",
                          event.target.checked
                        )
                      }
                      className="h-4 w-4 accent-accent"
                    />
                    Gunakan Stimulus
                  </label>

                  {editorForm.stimulus.enabled && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-ink-secondary">
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
                          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
                        >
                          {STIMULUS_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-ink-secondary">
                          Judul Stimulus
                        </label>

                        <input
                          value={editorForm.stimulus.title}
                          onChange={(event) =>
                            updateStimulusField("title", event.target.value)
                          }
                          className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2.5 text-sm"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-ink-secondary">
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
                          className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2.5 text-sm leading-6"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-ink-secondary">
                          URL Berkas
                        </label>

                        <input
                          value={editorForm.stimulus.file_url}
                          onChange={(event) =>
                            updateStimulusField("file_url", event.target.value)
                          }
                          className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2.5 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-ink-secondary">
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
                          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
                        >
                          {USAGE_RIGHTS.map((right) => (
                            <option key={right} value={right}>
                              {right}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-ink-secondary">
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
                          className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2.5 text-sm"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-ink-secondary">
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
                          className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* PILIHAN JAWABAN */}

                {selectedQuestion.question_type !== "PGK_KATEGORI" && (
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="font-bold text-ink-body">
                        Pilihan Jawaban
                      </h4>

                      <button
                        onClick={addOption}
                        className="rounded-lg border border-accent-line bg-surface px-3 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-soft"
                      >
                        + Tambah Opsi
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {editorForm.options.map((option, index) => (
                        <div
                          key={index}
                          className="rounded-xl border border-line bg-surface p-4"
                        >
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                            <div className="md:col-span-2">
                              <label className="text-xs font-semibold text-ink-muted">
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
                                className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="md:col-span-8">
                              <label className="text-xs font-semibold text-ink-muted">
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
                                className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="flex items-end md:col-span-2">
                              <button
                                onClick={() => removeOption(index)}
                                className="w-full rounded-lg border border-danger-line px-3 py-2 text-xs font-semibold text-danger-ink hover:bg-danger-soft"
                              >
                                Hapus
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs font-semibold text-ink-body">
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
                                className="h-4 w-4 accent-accent"
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
                                className="w-full rounded-lg border border-line-strong px-3 py-2 text-xs"
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
                      <h4 className="font-bold text-ink-body">
                        Pernyataan Kategori
                      </h4>

                      <button
                        onClick={addCategoryItem}
                        className="rounded-lg border border-accent-line bg-surface px-3 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-soft"
                      >
                        + Tambah Pernyataan
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {editorForm.category_items.map((item, index) => (
                        <div
                          key={index}
                          className="rounded-xl border border-line bg-surface p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-bold text-ink-body">
                              Pernyataan {index + 1}
                            </p>

                            <button
                              onClick={() => removeCategoryItem(index)}
                              className="text-xs font-semibold text-danger-ink hover:underline"
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
                            className="mt-3 w-full rounded-lg border border-line-strong px-3 py-2.5 text-sm"
                          />

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="text-xs font-semibold text-ink-muted">
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
                                className="mt-2 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-ink-muted">
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
                                className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
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
                            className="mt-3 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PEMBAHASAN UMUM */}

                <label className="mt-6 block text-sm font-semibold text-ink-body">
                  Pembahasan Umum
                </label>

                <textarea
                  rows={5}
                  value={editorForm.explanation}
                  onChange={(event) =>
                    updateEditorField("explanation", event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm leading-6"
                />

                {/* SIMPAN REVISI */}

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={saveEditor}
                    disabled={editorSaving}
                    className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-50"
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
                    className="rounded-lg border border-line-strong bg-surface px-5 py-3 text-sm font-semibold text-ink-body hover:bg-surface-muted"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* FOOTER */}

        <footer className="border-t border-line pt-5 text-center text-xs text-ink-muted">
          TKA TryOn · SKILL ON • CONFIDENCE ON
        </footer>
      </div>
    </main>
  );
}
