import { Link } from "@/lib/wouter";

export default function MoveGridBrand() {
  return <Link href="/" className="movegrid-brand" aria-label="MoveFlew home">
    <svg viewBox="0 0 64 68" fill="none" aria-hidden="true" className="movegrid-symbol">
      <path d="M32 3 60 19v30L32 65 4 49V19L32 3Z M4 19l28 16 28-16 M32 35v30" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
        <path d="m13.33 13.67 28 16 M22.67 8.33l28 16 M13.33 24.33l28-16 M22.67 29.67l28-16 M13.33 24.33v30 M22.67 29.67v30 M41.33 29.67v30 M50.67 24.33v30 M4 29l28 16 28-16 M4 39l28 16 28-16" />
      </g>
    </svg>
    <span>Move<span className="movegrid-word-accent">Flew</span></span>
  </Link>;
}