import { useState, useRef } from "react";

export default function UploadBox({ setFile }) {
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(null);
  const inputRef = useRef();

  const ACCEPT = ".wav,.flac";

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function handleFile(file) {
    if (!file) return;
    setSelected(file);
    setFile(file);
  }

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`
          relative overflow-hidden rounded-[14px] border-[1.5px] border-dashed
          px-6 py-10 text-center cursor-pointer transition-all duration-200
          ${dragging
            ? "border-cyan bg-cyan/6"
            : "border-border-dim bg-card hover:border-cyan hover:bg-cyan/[0.025]"
          }
        `}
      >
        {/* Radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-cyan) 7%, transparent) 0%, transparent 65%)" }}
        />

        {/* Icon */}
        <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full border border-border-dim bg-card-inner">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 17V8M12 8L9 11M12 8L15 11"
              stroke="var(--color-cyan)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 20h14" stroke="var(--color-cyan)" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
          </svg>
        </div>

        <p className="text-[15px] font-bold text-text-primary">Drop your audio file here</p>
        <p className="mt-1 font-mono text-[12px] text-text-dim">Drag &amp; drop or browse from your device</p>

        {/* Format tags */}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {[".wav", ".flac"].map((ext) => (
            <span key={ext} className="rounded-md border border-border-dim bg-card-inner px-2 py-0.5 font-mono text-[10px] text-text-muted">
              {ext}
            </span>
          ))}
        </div>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] text-[#4a5568]">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Browse button */}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-[9px] border border-cyan/30 bg-cyan/10 px-5 py-2 font-mono text-[12px] text-cyan transition-colors hover:bg-cyan/18"
          onClick={(e) => { e.stopPropagation(); inputRef.current.click(); }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="3" width="11" height="8.5" rx="1.5" stroke="var(--color-cyan)" strokeWidth="1.3"/>
            <path d="M4.5 3V2.5a2 2 0 014 0V3" stroke="var(--color-cyan)" strokeWidth="1.3"/>
          </svg>
          Browse files
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Selected file info */}
      {selected && (
        <div className="flex items-center gap-3 rounded-[12px] border border-border bg-card px-4 py-3">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border border-blue/25 bg-blue/12">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 2h7l4 4v11a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="var(--color-blue)" strokeWidth="1.3"/>
              <path d="M11 2v4h4" stroke="var(--color-blue)" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M6 10.5q1.5-2 3 0t3 0" stroke="var(--color-blue)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-text-primary">{selected.name}</p>
            <p className="font-mono text-[11px] text-text-dim">
              {formatSize(selected.size)} · {selected.type.split("/")[1]?.toUpperCase() ?? "AUDIO"}
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-[8px] border border-cyan/25 bg-cyan/10 px-2.5 py-0.5 font-mono text-[10px] text-cyan">
            ready
          </span>
        </div>
      )}
    </div>
  );
}