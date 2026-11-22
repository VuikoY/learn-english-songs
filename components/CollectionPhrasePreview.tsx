const WORD_PATTERN = /[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu;

function PhraseText({ text, keywords }: { text: string; keywords: Set<string> }) {
  const parts = text.split(/([\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*)/gu);
  return (
    <>
      {parts.map((part, index) => keywords.has(part.toLowerCase())
        ? <strong key={`${index}-${part}`} className="font-semibold text-foreground">{part}</strong>
        : part)}
    </>
  );
}

export default function CollectionPhrasePreview({ title, phrases }: { title: string; phrases: string[] }) {
  if (phrases.length === 0) return null;
  const keywords = new Set(Array.from(title.matchAll(WORD_PATTERN), ([word]) => word.toLowerCase()).slice(0, 2));

  return (
    <ul className="mt-2 space-y-1.5 px-4 pb-3">
      {phrases.slice(0, 3).map((phrase, index) => (
        <li key={`${index}-${phrase}`} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full border border-muted-foreground/60" aria-hidden="true" />
          <span className="min-w-0 truncate"><PhraseText text={phrase} keywords={keywords} /></span>
        </li>
      ))}
    </ul>
  );
}
