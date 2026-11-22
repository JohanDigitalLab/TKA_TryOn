import { useId } from "react";
import { buildScoreChart } from "@/lib/student/score-chart.mjs";

const DEFAULT_ACCENT = "#2563eb";

export default function ResultsTrendChart({
  title,
  sessions = [],
  accent = DEFAULT_ACCENT,
  emptyText = "Belum ada data untuk ditampilkan.",
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { width, height, left, right, top, bottom, points, line } = buildScoreChart(sessions);

  if (!points.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{emptyText}</p>
      </section>
    );
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5">
      <h4 className="text-sm font-bold text-slate-900">{title}</h4>
      <figure className="mt-3">
        <div className="w-full overflow-hidden rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={`${titleId} ${descriptionId}`}
            className="block h-auto w-full max-w-full"
          >
            <title id={titleId}>{title}</title>
            <desc id={descriptionId}>
              Nilai lima sesi terakhir dari yang paling lama ke yang paling baru, skala 0 sampai 100.
            </desc>
            {[0, 20, 40, 60, 80, 100].map((score) => {
              const y = top + ((100 - score) / 100) * (height - top - bottom);
              return (
                <g key={score}>
                  <line
                    x1={left}
                    y1={y}
                    x2={width - right}
                    y2={y}
                    stroke="#cbd5e1"
                    strokeDasharray={score === 0 ? undefined : "4 5"}
                  />
                  <text x={left - 12} y={y + 4} textAnchor="end" fill="#64748b" fontSize="12">
                    {score}
                  </text>
                </g>
              );
            })}
            <text x={left} y={16} fill="#475569" fontSize="12">
              Nilai
            </text>
            <polyline points={line} fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((point, index) => (
              <g key={point.attemptId || `${point.label}-${index}`}>
                <circle cx={point.x} cy={point.y} r="5" fill={accent} stroke="white" strokeWidth="2">
                  <title>{`${point.label || `Sesi ${index + 1}`}: ${point.score.toFixed(2)}`}</title>
                </circle>
                <text x={point.x} y={point.y - 13} textAnchor="middle" fill={accent} fontSize="12" fontWeight="700">
                  {point.score.toFixed(0)}
                </text>
                <text x={point.x} y={height - bottom + 22} textAnchor="middle" fill="#475569" fontSize="11">
                  {point.label || `Sesi ${index + 1}`}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            <span aria-hidden="true" className="mr-2 inline-block h-0.5 w-5 align-middle" style={{ background: accent }} />
            Nilai per sesi · skala 0–100
          </span>
          <span>5 sesi terakhir · lama → baru</span>
        </figcaption>
      </figure>
      <details className="mt-3 text-sm text-slate-600">
        <summary className="w-fit cursor-pointer rounded py-2 font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">
          Lihat rincian nilai
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Rincian nilai {title}</caption>
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className="p-2">#</th>
                <th scope="col" className="p-2">Mata pelajaran</th>
                <th scope="col" className="p-2">Waktu selesai</th>
                <th scope="col" className="p-2">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={`${point.attemptId || index}-row`} className="border-b border-slate-100">
                  <th scope="row" className="p-2">{index + 1}</th>
                  <td className="p-2">{point.subject || "Mata pelajaran"}</td>
                  <td className="p-2">{point.completedAt ? new Date(point.completedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                  <td className="p-2 font-bold text-blue-700">{point.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
