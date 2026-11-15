import { useId } from "react";
import { buildScoreChart } from "@/lib/student/score-chart.mjs";

export default function ScoreLineChart({ sessions }) {
  const titleId = useId();
  const descriptionId = useId();
  const { width, height, left, right, top, bottom, points, line } = buildScoreChart(sessions);

  if (!points.length) {
    return <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Belum ada sesi pada paket ini.</p>;
  }

  return (
    <figure className="mt-5">
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`} className="h-auto w-full" style={{ minWidth: width }}>
          <title id={titleId}>Grafik garis perkembangan nilai</title>
          <desc id={descriptionId}>Nilai setiap sesi dari yang paling awal hingga terbaru, dengan skala 0 sampai 100. Rincian tersedia pada tabel setelah grafik.</desc>
          {[0, 20, 40, 60, 80, 100].map((score) => {
            const y = top + (100 - score) / 100 * (height - top - bottom);
            return (
              <g key={score}>
                <line x1={left} y1={y} x2={width - right} y2={y} stroke="#cbd5e1" strokeDasharray={score === 0 ? undefined : "4 5"} />
                <text x={left - 12} y={y + 4} textAnchor="end" fill="#64748b" fontSize="12">{score}</text>
              </g>
            );
          })}
          <text x={left} y={16} fill="#475569" fontSize="12">Nilai</text>
          <polyline points={line} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((point, index) => (
            <g key={point.attemptId || index}>
              <circle cx={point.x} cy={point.y} r="5" fill="#2563eb" stroke="white" strokeWidth="2">
                <title>{`Sesi ${index + 1} · ${point.subject || "Mata pelajaran"}: ${point.score.toFixed(2)}`}</title>
              </circle>
              <text x={point.x} y={point.y - 13} textAnchor="middle" fill="#1d4ed8" fontSize="12" fontWeight="700">{point.score.toFixed(0)}</text>
              <text x={point.x} y={height - bottom + 24} textAnchor="middle" fill="#64748b" fontSize="11">Sesi {index + 1}</text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span><span aria-hidden="true" className="mr-2 inline-block h-0.5 w-5 align-middle bg-blue-600" />Nilai per sesi · skala 0–100</span>
        <span>Urutan sesi paling awal → terbaru</span>
      </figcaption>
      <details className="mt-3 text-sm text-slate-600">
        <summary className="w-fit cursor-pointer rounded py-2 font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Lihat data nilai per sesi</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Data perkembangan nilai sesuai grafik</caption>
            <thead><tr className="border-b border-slate-200"><th scope="col" className="p-2">Sesi</th><th scope="col" className="p-2">Mata pelajaran</th><th scope="col" className="p-2">Waktu selesai</th><th scope="col" className="p-2">Nilai</th></tr></thead>
            <tbody>{points.map((point, index) => <tr key={point.attemptId || index} className="border-b border-slate-100"><th scope="row" className="p-2">{index + 1}</th><td className="p-2">{point.subject || "Mata pelajaran"}</td><td className="p-2">{point.completedAt ? new Date(point.completedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="p-2 font-bold text-blue-700">{point.score.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
