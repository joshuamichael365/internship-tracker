/**
 * Lightweight formatter for plain-text posting descriptions: splits on blank
 * lines into paragraphs, groups consecutive bullet-ish lines (-, •, *) into
 * <ul>s, and linkifies bare URLs. No dependencies, no dangerouslySetInnerHTML
 * — everything is built as real React elements.
 */

const URL_RE = /(https?:\/\/[^\s)]+)/g;
const BULLET_RE = /^\s*[-•*]\s+/;

function linkify(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
        >
          {part}
        </a>
      );
    }
    return part ? <span key={`${keyPrefix}-${i}`}>{part}</span> : null;
  });
}

export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);

  return (
    <div className="grid gap-3 text-[14px] leading-relaxed text-secondary">
      {blocks.map((block, blockIdx) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;

        const isBulletBlock = lines.every((l) => BULLET_RE.test(l));
        if (isBulletBlock) {
          return (
            <ul key={blockIdx} className="ml-4 list-disc space-y-1">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>{linkify(line.replace(BULLET_RE, ""), `${blockIdx}-${lineIdx}`)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIdx} className="whitespace-pre-wrap">
            {lines.map((line, lineIdx) => (
              <span key={lineIdx}>
                {linkify(line, `${blockIdx}-${lineIdx}`)}
                {lineIdx < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
