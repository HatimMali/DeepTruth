import { useState } from "react";

export default function SaliencyChart({ data, chunks, anomalyLocation }) {
  const [hovered, setHovered] = useState(null);

  if (!chunks?.length) return null;

  const totalDuration = chunks[chunks.length - 1].time_end;
  const H = 80;
  const midY = H / 2;

  const maxImportance = Math.max(...(data?.map((d) => d.importance) ?? [1]));

  return (
    <div className="rounded-[14px] border border-border bg-card p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[13px] font-bold text-text-primary">Forensic Waveform</span>
          <p className="font-mono text-[10px] text-text-dim mt-0.5">
            hover segments · red = tampered · cyan = clean
          </p>
        </div>
        
      </div>

      {/* SVG Waveform — uses percentage widths via foreignObject trick avoided,
          instead we use a viewBox that matches rendered pixel width conceptually */}
      <div
        className="relative rounded-[10px] overflow-hidden w-full"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
          height: `${H}px`,
        }}
      >
        {/* Render each chunk as absolutely positioned div strips */}
        {chunks.map((chunk) => {
          const leftPct = (chunk.time_start / totalDuration) * 100;
          const widthPct = ((chunk.time_end - chunk.time_start) / totalDuration) * 100;
          const color = chunk.flagged ? "#f85149" : "#00d4aa";
          const bgColor = chunk.flagged ? "rgba(248,81,73,0.08)" : "transparent";

          // Generate deterministic bar heights
          const barCount = 18;
          const bars = Array.from({ length: barCount }, (_, i) => {
            const seed = Math.abs(Math.sin((chunk.chunk_index * 100 + i) * 9301 + 49297));
            const amp = (0.15 + seed * 0.75) * (midY - 4) * (0.5 + chunk.probability * 0.5);
            return amp;
          });

          return (
            <div
              key={chunk.chunk_index}
              className="absolute top-0 h-full"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                background: bgColor,
                borderRight: "1px solid rgba(255,255,255,0.05)",
              }}
              onMouseEnter={() => setHovered(chunk)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Bars inside each chunk */}
              <div className="relative w-full h-full flex items-center justify-around px-[2px]">
                {bars.map((amp, i) => (
                  <div
                    key={i}
                    className="rounded-full flex-1 mx-[0.5px]"
                    style={{
                      height: `${(amp / midY) * 100}%`,
                      background: color,
                      opacity: chunk.flagged ? 0.7 + chunk.probability * 0.3 : 0.5,
                      minWidth: "2px",
                      maxWidth: "4px",
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Center baseline */}
        <div
          className="absolute w-full pointer-events-none"
          style={{
            top: "50%",
            height: "1px",
            background: "rgba(255,255,255,0.07)",
          }}
        />

        {/* Hover tooltip */}
        {hovered && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 rounded-[8px] px-3 py-1.5 pointer-events-none z-10 whitespace-nowrap"
            style={{
              background: "rgba(13,17,23,0.95)",
              border: `1px solid ${hovered.flagged ? "rgba(248,81,73,0.5)" : "rgba(0,212,170,0.5)"}`,
            }}
          >
            <p className="font-mono text-[11px]" style={{ color: hovered.flagged ? "#f85149" : "#00d4aa" }}>
              {hovered.time_start}s – {hovered.time_end}s
            </p>
            <p className="font-mono text-[10px] text-text-dim">
              prob: {hovered.probability.toFixed(4)} · {hovered.flagged ? "⚠ tampered" : "✓ clean"}
            </p>
          </div>
        )}
      </div>

      {/* Time axis */}
      <div className="flex justify-between font-mono text-[9px] text-text-dim">
        <span>0.0s</span>
        {chunks
          .filter((_, i) => i > 0 && i % Math.ceil(chunks.length / 5) === 0)
          .map((c) => (
            <span key={c.chunk_index}>{c.time_start.toFixed(1)}s</span>
          ))}
        <span>{totalDuration.toFixed(1)}s</span>
      </div>

      {/* Saliency bars */}
      {data?.length > 0 && (
        <div>
          <p
            className="font-mono text-[10px] text-text-dim uppercase mb-2"
            style={{ letterSpacing: "0.6px" }}
          >
            Gradient Saliency · most suspicious chunk
          </p>
          <div className="space-y-2">
            {data.map((d, i) => {
              const pct = Math.round((d.importance / maxImportance) * 100);
              return (
                <div key={d.region} className="flex items-center gap-2.5">
                  <span className="w-4 shrink-0 font-mono text-[10px] text-text-dim">{i + 1}</span>
                  <span className="w-[220px] shrink-0 font-mono text-[10px] text-text-muted">
                    {d.region}
                  </span>
                  <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, #f85149, #ff7b72)",
                      }}
                    />
                  </div>
                  <span className="w-[48px] shrink-0 text-right font-mono text-[10px] text-red">
                    {d.importance.toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Anomaly footer */}
      {anomalyLocation && anomalyLocation !== "N/A" && (
        <div
          className="flex items-center gap-2 rounded-[8px] px-3 py-2"
          style={{
            background: "rgba(248,81,73,0.06)",
            border: "1px solid rgba(248,81,73,0.15)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
            <circle cx="6" cy="6" r="5" stroke="#f85149" strokeWidth="1.2" />
            <path d="M6 4v2.5M6 8v.5" stroke="#f85149" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="font-mono text-[10px] text-text-dim">anomaly · </span>
          <span className="font-mono text-[10px] text-red">{anomalyLocation}</span>
        </div>
      )}
    </div>
  );
}