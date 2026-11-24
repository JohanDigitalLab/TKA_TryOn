export function categoryOptions(items = []) {
  return [...new Set(items.flatMap(item => [item.category_label, ...(item.category_options || [])])
    .filter(Boolean).flatMap(label => label.split(/\s*[/|;]\s*/)).map(label => label.trim()).filter(Boolean))];
}
export function normalizeQuestion(q, subject) {
  return { ...q, subject, question: q.text, passage: q.stimulus?.content_text,
    options: (q.options || []).map(o => o.option_text),
    answer: (q.options || []).findIndex(o => (q.answer_keys?.options || []).includes(o.option_code)) };
}
export function answerPayload(q, selection) {
  if (q.type === 'PGK_KATEGORI') return { category_answers: { ...selection } };
  const indexes = Array.isArray(selection) ? selection : [selection];
  return { option_codes: indexes.map(i => q.options[i].option_code).sort() };
}
export function createBossfightClient(getToken, fetcher = fetch) {
  return async function request(payload) {
    const token = await getToken();
    if (!token) throw new Error('Sesi berakhir. Silakan login kembali.');
    const response = await fetcher('/api/bossfight', {
      method: payload ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Gagal menghubungi BossFight.');
    return body.data;
  };
}
