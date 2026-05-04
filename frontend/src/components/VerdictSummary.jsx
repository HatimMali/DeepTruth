export default function VerdictSummary({ result }) {
  const isTampered = result.prediction?.toLowerCase() === "tampered";

  const {
    technique,
    techniques = [],
    confidence,
    total_chunks,
    flagged_chunks,
    top_regions,
    anomaly_location,
  } = result;

  const confidencePct  = (confidence * 100).toFixed(1);
  const topRegion      = top_regions?.[0]?.region ?? null;
  const secondary      = techniques?.[1];

  // ── Verdict text ──────────────────────────────────────────────────────
  let headline = "";
  let body     = "";
  let footer   = "";

  if (isTampered) {
    headline = `Audio detected as tampered.`;

    const segmentText =
      flagged_chunks === total_chunks
        ? `all ${total_chunks} analyzed segments`
        : `${flagged_chunks} out of ${total_chunks} analyzed segments`;

    const regionText = topRegion
      ? `Most prominent anomaly found in the ${topRegion}.`
      : "";

    body = `Tampering was found across ${segmentText} with ${confidencePct}% confidence. ${regionText}`;

    const insights = {
      noise:    "Noise injection typically adds artificial energy across all frequency bands, making it detectable throughout the full duration.",
      splice:   "Splice tampering creates phase discontinuities at cut points, most visible in high-frequency bands at segment boundaries.",
      pitch:    "Pitch shifting alters the harmonic structure of the audio, leaving spectral artifacts across mid and high frequencies.",
      speed:    "Speed manipulation distorts the temporal structure of speech, causing unnatural transitions between segments.",
      compress: "Compression artifacts appear as energy inconsistencies across the dynamic range of the signal.",
      eq:       "EQ tampering selectively boosts or cuts frequency bands, leaving an unnatural spectral fingerprint.",
      clip:     "Clipping introduces harmonic distortion at amplitude peaks, detectable in high-frequency overtones.",
      resample: "Resampling leaves aliasing artifacts at the Nyquist boundary, visible in the upper frequency bands.",
      reverb:   "Added reverb creates unnatural room acoustics inconsistent with the original recording environment.",
    };

    footer = "The model identified statistical inconsistencies in the spectrogram that are characteristic of audio manipulation.";

  } else {
    headline = "Audio appears authentic.";
    body     = `No tampering was detected across any of the ${total_chunks} analyzed segment${total_chunks !== 1 ? "s" : ""}. Confidence: ${confidencePct}%.`;
    footer   = "The spectral and temporal features of this audio are consistent with an unmodified recording.";
  }

  const borderColor = isTampered ? "rgba(248,81,73,0.2)"  : "rgba(0,212,170,0.2)";
  const bgColor     = isTampered ? "rgba(248,81,73,0.04)" : "rgba(0,212,170,0.04)";
  const accentColor = isTampered ? "#f85149" : "#00d4aa";

  return (
    <div
      className="rounded-[14px] p-4 space-y-3"
      style={{ border: `1px solid ${borderColor}`, background: bgColor }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {isTampered ? (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0">
            <circle cx="7.5" cy="7.5" r="6.5" stroke={accentColor} strokeWidth="1.3" />
            <path d="M7.5 4.5v3M7.5 10v.5" stroke={accentColor} strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0">
            <circle cx="7.5" cy="7.5" r="6.5" stroke={accentColor} strokeWidth="1.3" />
            <path d="M4.5 7.5l2 2 4-4" stroke={accentColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span
          className="font-mono text-[11px] uppercase"
          style={{ color: accentColor, letterSpacing: "0.6px" }}
        >
          Forensic Verdict
        </span>
      </div>

      {/* Headline */}
      <p className="text-[13px] font-bold text-text-primary leading-snug">
        {headline}
      </p>

      {/* Body */}
      <p className="font-mono text-[11px] text-text-muted leading-relaxed">
        {body}
      </p>


      {/* Divider */}
      <div className="border-t border-border" />

      {/* Footer insight */}
      <p className="font-mono text-[10px] text-text-dim leading-relaxed">
        {footer}
      </p>

      {/* Anomaly pill */}
      {isTampered && anomaly_location && anomaly_location !== "N/A" && (
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            background: "rgba(248,81,73,0.08)",
            border: "1px solid rgba(248,81,73,0.2)",
          }}
        >
          <span className="font-mono text-[9px] text-text-dim">primary anomaly</span>
          <span className="font-mono text-[9px] text-red">{anomaly_location}</span>
        </div>
      )}
    </div>
  );
}