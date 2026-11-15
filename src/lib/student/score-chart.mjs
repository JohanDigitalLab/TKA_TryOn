export function buildScoreChart(sessions = []) {
  const width = Math.max(560, sessions.length * 76 + 72);
  const height = 280;
  const left = 44;
  const right = 28;
  const top = 36;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = sessions.map((session, index) => {
    const value = Number(session.score);
    const score = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
    return {
      ...session,
      score,
      x: sessions.length === 1 ? left + plotWidth / 2 : left + index / (sessions.length - 1) * plotWidth,
      y: top + (100 - score) / 100 * plotHeight,
    };
  });
  return { width, height, left, right, top, bottom, points, line: points.map(({ x, y }) => `${x},${y}`).join(" ") };
}
