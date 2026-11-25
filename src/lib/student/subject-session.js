const labels = { EXERCISE: "latihan", ASSIGNMENT: "tugas sekolah", TRYOUT: "tryout" };

// A conflict is not a successful start. Never navigate automatically across types.
export function getSubjectSessionConflict(data) {
  if (data?.status !== "SUBJECT_SESSION_ACTIVE") return null;
  const session = data.existing_session;
  const label = labels[session?.attempt_type];
  const canResume = session?.can_resume === true && label
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session?.attempt_id || "");
  if (data.reason === "GAME_SESSION_ACTIVE") {
    return { message: "Masih ada sesi game aktif untuk mata pelajaran ini. Buka kembali game tersebut dan selesaikan sesinya sebelum memulai sesi baru.", href: null };
  }
  return {
    message: label
      ? `Masih ada sesi ${label} ${session.subject_name || "mata pelajaran ini"} yang belum selesai. Lanjutkan dan selesaikan sesi tersebut sebelum memulai sesi baru.`
      : "Masih ada sesi aktif untuk mata pelajaran ini. Hubungi pengelola untuk memeriksa sesi tersebut tanpa menghapus progresmu.",
    href: canResume ? `/student/challenge?attemptId=${encodeURIComponent(session.attempt_id)}` : null,
    label: label ? `Lanjutkan ${label} yang ada` : null,
  };
}

export function getSubjectSessionError(error, fallback) {
  if (/Finish or resume (?:the )?existing subject session/i.test(error?.message || "")) {
    return "Masih ada sesi aktif pada mata pelajaran ini. Lanjutkan dari halaman Latihan Soal, Tugas, atau game asalnya. Jika tidak ditemukan, minta pengelola memeriksa sesi dan memperbarui RPC penanganan konflik; progresmu tidak perlu dihapus.";
  }
  return error?.message || fallback;
}
