export default function ResultCard({ result }) {
  const isTampered =
    result.prediction?.toLowerCase() === "tampered";

  const isDeepfake =
    result.segments && Array.isArray(result.segments);

  const isSpoof =
    result.prediction?.toLowerCase() === "spoof" ||
    result.prediction?.toLowerCase() === "deepfake";

  const confidencePct = (result.confidence * 100).toFixed(1);

  // --- Deepfake specific ---
  const totalSegments = isDeepfake ? result.segments.length : result.total_chunks ?? "—";

  const flaggedSegments = isDeepfake
    ? result.segments.filter((s) => s.prob > 0.5).length
    : result.flagged_chunks ?? 0;

  const duration = isDeepfake && result.segments.length > 0
    ? result.segments[result.segments.length - 1].end + " sec"
    : result.duration ?? "—";

  // Most suspicious segment — only computed when spoof
  const topSegment = isDeepfake && isSpoof
    ? result.segments.reduce((max, s) =>
        s.prob > max.prob ? s : max,
        result.segments[0]
      )
    : null;

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13px] font-bold text-text-primary">
          Analysis Result
        </span>

        <div
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px]"
          style={
            isTampered
              ? { background: "rgba(248,81,73,0.1)", borderColor: "rgba(248,81,73,0.3)", color: "#f85149" }
              : { background: "rgba(0,212,170,0.1)", borderColor: "rgba(0,212,170,0.3)", color: "#00d4aa" }
          }
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {result.prediction?.toUpperCase()}
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {[
          {
            label: isDeepfake ? "Spoof Score" : "Tamper Score",
            value: result.confidence.toFixed(3),
            color: isTampered ? "#f85149" : "#00d4aa",
            sub: isTampered
              ? `threshold: ${result.threshold ?? "0.74"}`
              : "avg over chunks",
          },
          {
            label: "Chunks",
            value: totalSegments,
            color: "#58c8f0",
            sub: `${flaggedSegments} flagged`,
          },
          {
            label: "Duration",
            value: duration,
            color: "#00d4aa",
            sub: result.format ?? "audio",
          },
        ].map((m) => (
          <div key={m.label} className="rounded-[10px] border border-border-dim bg-card-inner p-3">
            <p
              className="mb-1.5 font-mono text-[10px] uppercase text-text-dim"
              style={{ letterSpacing: "0.5px" }}
            >
              {m.label}
            </p>
            <p className="text-[20px] font-bold leading-none" style={{ color: m.color }}>
              {m.value}
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-dim">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Confidence bar */}
      <div>
        <div className="mb-1.5 flex justify-between">
          <span className="font-mono text-[10px] text-text-dim">Confidence</span>
          <span
            className="font-mono text-[10px]"
            style={{ color: isTampered ? "#f85149" : "#00d4aa" }}
          >
            {confidencePct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${confidencePct}%`,
              background: isTampered
                ? "linear-gradient(90deg,#f85149,#ff7b72)"
                : "linear-gradient(90deg,#0096c7,#00d4aa)",
            }}
          />
        </div>
      </div>

      {/* Detail rows */}
      <div className="mt-3">
        {[
          ["prediction", result.prediction],

          !isDeepfake
            ? ["anomaly location", result.anomaly_location ?? "—"]
            : null,

          isDeepfake && isSpoof
            ? [
                "most suspicious segment",
                topSegment
                  ? `${topSegment.start}s - ${topSegment.end}s`
                  : "—",
              ]
            : null,

          isDeepfake && isSpoof
            ? [
                "peak spoof score",
                topSegment ? topSegment.prob.toFixed(3) : "—",
              ]
            : null,

          !isDeepfake
            ? ["xai method", "Input Gradient Saliency"]
            : null,

          ["processing time", result.processing_time ?? "—"],
        ]
          .filter(Boolean)
          .map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-t border-border py-2">
              <span className="font-mono text-[11px] text-text-dim">{k}</span>
              <span className="font-mono text-[11px] text-text-secondary">{v}</span>
            </div>
          ))}
      </div>

    </div>
  );
}