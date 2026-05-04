import { useEffect, useState } from "react";
import { getHealth, getInfo } from "../services/api";

const StatusPill = ({ ok }) => (
  <div
    className="flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px]"
    style={
      ok
        ? { background: "rgba(0,212,170,0.1)", borderColor: "rgba(0,212,170,0.3)", color: "#00d4aa" }
        : { background: "rgba(248,81,73,0.1)", borderColor: "rgba(248,81,73,0.3)", color: "#f85149" }
    }
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {ok ? "operational" : "degraded"}
  </div>
);

const Badge = ({ status }) => {
  const styles = {
    online:   { background: "rgba(0,212,170,0.1)",  color: "#00d4aa" },
    degraded: { background: "rgba(239,183,79,0.1)", color: "#efb84f" },
    offline:  { background: "rgba(248,81,73,0.1)",  color: "#f85149" },
  };
  const s = styles[status] ?? styles.online;
  return (
    <span
      className="shrink-0 rounded-[8px] px-2 py-0.5 font-mono text-[10px]"
      style={s}
    >
      {status}
    </span>
  );
};

const MetricCard = ({ label, value, color }) => (
  <div className="rounded-[10px] border border-border-dim bg-card-inner p-3">
    <p className="mb-1.5 font-mono text-[10px] uppercase text-text-dim" style={{ letterSpacing: "0.5px" }}>
      {label}
    </p>
    <p className="text-[15px] font-bold" style={{ color }}>
      {value}
    </p>
  </div>
);

const ModelCard = ({ name, type, dotColor, metrics }) => (
  <div className="rounded-[10px] border border-border-dim bg-card-inner p-3.5">
    {/* Fixed header: added flex-wrap and justify-between to keep 'type' inside the container */}
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: dotColor }} />
        <span className="text-[12px] font-bold text-text-secondary">{name}</span>
      </div>
      <span className="font-mono text-[10px] text-text-dim">{type}</span>
    </div>
    {metrics.map(([k, v, highlight]) => (
      <div key={k} className="mt-1 flex justify-between">
        <span className="font-mono text-[10px] text-text-dim">{k}</span>
        <span
          className="font-mono text-[10px]"
          style={{ color: highlight ? "#00d4aa" : "#c9d1d9" }}
        >
          {v}
        </span>
      </div>
    ))}
  </div>
);

export default function HealthPanel() {
  const [health, setHealth] = useState(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [h, i] = await Promise.all([getHealth(), getInfo()]);
        setHealth(h.data);
        setInfo(i.data);
      } catch (err) {
        console.error("Health check failed:", err);
        setError(true);
      }
    };
    load();
  }, []);

  if (error) return (
    <div
      className="rounded-[14px] border p-4"
      style={{
        background: "rgba(248,81,73,0.08)",
        borderColor: "rgba(248,81,73,0.3)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
          <circle cx="7" cy="7" r="5.5" stroke="#f85149" strokeWidth="1.3" />
          <path d="M7 4.5V7M7 9v.5" stroke="#f85149" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="font-mono text-[12px] text-red">Could not reach API — is the backend running?</span>
      </div>
    </div>
  );

  if (!health || !info) return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className="h-2 w-2 animate-pulse rounded-full bg-cyan" />
        <span className="font-mono text-[12px] text-text-dim">Loading system status…</span>
      </div>
    </div>
  );

  const allOk = health.status === "healthy";

  const services = [
    {
      name: "API Gateway",
      sub: `p50: ${info.latency?.p50 ?? "—"} · p99: ${info.latency?.p99 ?? "—"}`,
      dot: "#00d4aa",
      status: "online",
    },
    {
      name: "GPU Inference",
      sub: health.gpu ? "hardware accelerated" : "fallback · CPU mode",
      dot: health.gpu ? "#00d4aa" : "#efb84f",
      status: health.gpu ? "online" : "degraded",
    },
    {
      name: "SHAP Engine",
      sub: `explainability v${info.shap_version ?? "—"}`,
      dot: "#00d4aa",
      status: "online",
    },
    {
      name: "File Parser",
      sub: "wav · flac",
      dot: "#00d4aa",
      status: "online",
    },
  ];

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13px] font-bold text-text-primary">
          {info.project} · v{info.version}
        </span>
        <StatusPill ok={allOk} />
      </div>

      {/* Summary metrics */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <MetricCard label="API Status"  value={health.status}                     color="#00d4aa" />
        <MetricCard label="Avg Latency" value={`${info.latency?.p50 ?? "—"} ms`} color="#58c8f0" />
        <MetricCard label="Uptime"      value={info.uptime ?? "—"}                color="#00d4aa" />
      </div>

      {/* Model info */}
      <p
        className="mb-2.5 font-mono text-[11px] uppercase text-text-muted"
        style={{ letterSpacing: "0.5px" }}
      >
        Model Info
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <ModelCard
          name="Tampering"
          type={info.models.tampering.type}
          dotColor="#00d4aa"
          metrics={[
            ["version",   info.models.tampering.version],
            ["accuracy",  info.models.tampering.metrics.accuracy,  true],
            ["f1 score",  info.models.tampering.metrics.f1],
            ["status",    health.models.tampering,                  true],
          ]}
        />
        <ModelCard
          name="Deepfake"
          type={info.models.deepfake.type}
          dotColor="#58c8f0"
          metrics={[
            ["version",   info.models.deepfake.version],
            ["accuracy",  info.models.deepfake.metrics.accuracy,  true],
            ["f1 score",  info.models.deepfake.metrics.f1],
            ["status",    health.models.deepfake,                  true],
          ]}
        />
      </div>

      {/* Services */}
      <div className="mb-2.5 h-px bg-border" />
      <p
        className="mb-2.5 font-mono text-[11px] uppercase text-text-muted"
        style={{ letterSpacing: "0.5px" }}
      >
        Services
      </p>
      <div className="grid grid-cols-2 gap-2">
        {services.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-2.5 rounded-[10px] border border-border-dim bg-card-inner px-3 py-2.5"
          >
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: s.dot }} />
            <div className="min-w-0">
              <p className="text-[12px] text-text-secondary">{s.name}</p>
              <p className="font-mono text-[10px] text-text-dim">{s.sub}</p>
            </div>
            <Badge status={s.status} />
          </div>
        ))}
      </div>

    </div>
  );
}