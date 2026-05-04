export default function ModelSelector({ model, setModel }) {
  const models = [
    {
      id: "tampering",
      label: "Tampering",
      desc: "Detects cuts, splices & spectral edits in audio recordings",
      color: "#00d4aa",
      borderActive: "rgba(0,212,170,0.4)",
      bgActive: "rgba(0,212,170,0.06)",
      iconBg: "rgba(0,212,170,0.1)",
      iconBorder: "rgba(0,212,170,0.25)",
      checkBg: "rgba(0,212,170,0.2)",
      icon: (
        <path d="M2 8h3l2-4 2 8 2-4h3" stroke="#00d4aa" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      ),
    },
    {
      id: "deepfake",
      label: "Deepfake",
      desc: "Identifies AI-synthesized or voice-cloned speech patterns",
      color: "#58c8f0",
      borderActive: "rgba(88,200,240,0.4)",
      bgActive: "rgba(88,200,240,0.06)",
      iconBg: "rgba(88,200,240,0.1)",
      iconBorder: "rgba(88,200,240,0.25)",
      checkBg: "rgba(88,200,240,0.2)",
      icon: (
        <>
          <circle cx="8" cy="6" r="3" stroke="#58c8f0" strokeWidth="1.4" />
          <path d="M2 14c0-2.5 2.7-4 6-4s6 1.5 6 4" stroke="#58c8f0"
            strokeWidth="1.4" strokeLinecap="round" />
        </>
      ),
    },
  ];

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">

      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-bold text-text-primary">
          Select analysis mode
        </span>
        <span className="font-mono text-[10px] text-text-dim">
          one model per analysis
        </span>
      </div>

      {/* Model cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {models.map((m) => {
          const active = model === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className="relative overflow-hidden rounded-[12px] border p-3.5 text-left transition-all duration-150"
              style={{
                borderColor: active ? m.borderActive : "#2a3441",
                background:  active ? m.bgActive     : "#161b22",
              }}
            >
              {/* Icon box */}
              <div
                className="mb-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border"
                style={{
                  background:  m.iconBg,
                  borderColor: m.iconBorder,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  {m.icon}
                </svg>
              </div>

              {/* Label */}
              <p className="text-[13px] font-bold" style={{ color: m.color }}>
                {m.label}
              </p>

              {/* Description */}
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-text-dim">
                {m.desc}
              </p>

              {/* Active checkmark */}
              {active && (
                <div
                  className="absolute right-3 top-3 flex h-[18px] w-[18px] items-center justify-center rounded-full"
                  style={{ background: m.checkBg }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5l2 2 4-4"
                      stroke={m.color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}