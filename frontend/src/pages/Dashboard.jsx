import { useState } from "react";
import UploadBox from "../components/UploadBox";
import ModelSelector from "../components/ModelSelector";
import ResultCard from "../components/ResultCard";
import SaliencyChart from "../components/SaliencyChart";
import HealthPanel from "../components/HealthPanel";
import VerdictSummary from "../components/VerdictSummary";
import { predictTampering, predictDeepfake } from "../services/api";

export default function Dashboard() {
  const [file, setFile]     = useState(null);
  const [model, setModel]   = useState("tampering");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const getAudioDuration = (file) => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(URL.createObjectURL(file));
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error("Could not read audio duration"));
      };
    });
  };

  const handleAnalyze = async () => {
    if (!file) return;

    try {
      const duration = await getAudioDuration(file);
      if (Number.isFinite(duration) && duration > 120) {
        setError("Audio must be 2 minutes or less.");
        return;
      }
    } catch {
      // If browser can't read duration, let backend enforce it
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = model === "tampering"
        ? await predictTampering(file)
        : await predictDeepfake(file);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Analysis failed. Please check your file and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface p-6 font-syne">

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ background: "linear-gradient(135deg,#00d4aa,#0096c7)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h4l2-5 3 10 3-10 2 5h4"
                stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-text-primary" style={{ letterSpacing: "-0.3px" }}>
              DeepTruth: Audio Forensic Platform
            </h1>
            <p className="font-mono text-[11px] text-text-dim">v2.4.1 · detection engine</p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            background: "rgba(0,212,170,0.08)",
            border: "1px solid rgba(0,212,170,0.25)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          <span className="font-mono text-[11px] text-cyan">all systems online</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">

        {/* Left — analysis flow */}
        <div className="flex flex-col gap-5">
          <p className="font-mono text-[10px] text-text-dim uppercase" style={{ letterSpacing: "0.8px" }}>
            01 · Upload
          </p>
          <UploadBox setFile={setFile} />

          <p className="font-mono text-[10px] text-text-dim uppercase" style={{ letterSpacing: "0.8px" }}>
            02 · Detection Model
          </p>
          <ModelSelector model={model} setModel={setModel} />

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] py-3.5 text-[14px] font-bold text-surface transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "linear-gradient(90deg,#0096c7,#00d4aa)" }}
          >
            {loading ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="#0d1117" strokeWidth="2"
                    strokeDasharray="28" strokeDashoffset="10"/>
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="#0d1117" strokeWidth="1.5"/>
                  <path d="M6 5.5L11 8L6 10.5V5.5Z" fill="#0d1117"/>
                </svg>
                Run Analysis
              </>
            )}
          </button>

          {/* Error banner */}
          {error && (
            <div
              className="flex items-center gap-3 rounded-[12px] px-4 py-3"
              style={{
                background: "rgba(248,81,73,0.08)",
                border: "1px solid rgba(248,81,73,0.3)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                <circle cx="8" cy="8" r="6.5" stroke="#f85149" strokeWidth="1.3"/>
                <path d="M8 5v3.5M8 10.5v.5" stroke="#f85149" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="font-mono text-[12px] text-red">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto font-mono text-[11px] text-text-dim hover:text-red"
              >
                dismiss
              </button>
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              <p className="font-mono text-[10px] text-text-dim uppercase" style={{ letterSpacing: "0.8px" }}>
                03 · Result
              </p>
              <ResultCard result={result} />
               {/* NEW — add this */}
               {model === "tampering" && (
                <VerdictSummary result={result} />
                )}

              {model === "tampering" && result.chunks?.length > 0 && (
  <>
    <p className="font-mono text-[10px] text-text-dim uppercase" style={{ letterSpacing: "0.8px" }}>
      04 · Saliency Analysis
    </p>
    <SaliencyChart
      data={result.top_regions}
      chunks={result.chunks}
      anomalyLocation={result.anomaly_location}
    />
  </>
)}
            </>
          )}
        </div>

        {/* Right — health sidebar */}
        <div className="flex flex-col gap-5">
          <p className="font-mono text-[10px] text-text-dim uppercase" style={{ letterSpacing: "0.8px" }}>
            System Health
          </p>
          <HealthPanel />
        </div>

      </div>
    </div>
  );
}