import { useId, type ReactNode } from "react";
import type { Language } from "@/types/game";

const flagShapes: Record<Language, ReactNode> = {
  uk: <><rect width="20" height="7" fill="#0057b8" /><rect y="7" width="20" height="7" fill="#ffd700" /></>,
  ru: <><rect width="20" height="4.67" fill="#fff" /><rect y="4.67" width="20" height="4.66" fill="#0039a6" /><rect y="9.33" width="20" height="4.67" fill="#d52b1e" /></>,
  en: <><rect width="20" height="14" fill="#012169" /><path d="M0 0 20 14M20 0 0 14" stroke="#fff" strokeWidth="3.6" /><path d="M0 0 20 14M20 0 0 14" stroke="#c8102e" strokeWidth="1.5" /><path d="M10 0v14M0 7h20" stroke="#fff" strokeWidth="5" /><path d="M10 0v14M0 7h20" stroke="#c8102e" strokeWidth="2.2" /></>,
  pl: <><rect width="20" height="7" fill="#fff" /><rect y="7" width="20" height="7" fill="#dc143c" /></>,
  es: <><rect width="20" height="3.5" fill="#aa151b" /><rect y="3.5" width="20" height="7" fill="#f1bf00" /><rect y="10.5" width="20" height="3.5" fill="#aa151b" /></>,
};

export default function LanguageFlag({ code }: { code: Language }) {
  const clipId = `flag-clip-${useId().replaceAll(":", "")}`;
  return (
    <svg aria-hidden="true" width="22" height="15.4" viewBox="0 0 20 14" style={{ width: 22, height: 15.4, minWidth: 22, maxWidth: 22, flexShrink: 0 }} className="inline-block overflow-hidden rounded-[2px] shadow-sm">
      <defs><clipPath id={clipId}><rect width="20" height="14" rx="2" /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>{flagShapes[code]}</g>
      <rect x="0.5" y="0.5" width="19" height="13" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.18" />
    </svg>
  );
}
