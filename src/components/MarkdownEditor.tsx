import { useRef, useState } from 'react';
import { LoreText } from './LoreText';

const TOOLS: { label: string; title: string; before: string; after?: string; line?: boolean }[] = [
  { label: 'B', title: 'Bold', before: '**', after: '**' },
  { label: 'I', title: 'Italic', before: '_', after: '_' },
  { label: 'H', title: 'Heading', before: '## ', line: true },
  { label: '❝', title: 'Quote', before: '> ', line: true },
  { label: '•', title: 'List', before: '- ', line: true },
  { label: '—', title: 'Divider', before: '\n---\n' },
  { label: '[[ ]]', title: 'Link to an Archive entry by title', before: '[[', after: ']]' },
  { label: '@', title: 'Mention a member by username', before: '@' },
];

/** Markdown textarea with a small formatting toolbar and a live preview tab. */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 16,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength: number;
  rows?: number;
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(t: (typeof TOOLS)[number]) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    let start = a;
    if (t.line) start = value.lastIndexOf('\n', a - 1) + 1;
    const selected = value.slice(a, b);
    const next = t.line
      ? value.slice(0, start) + t.before + value.slice(start)
      : value.slice(0, a) + t.before + selected + (t.after ?? '') + value.slice(b);
    onChange(next.slice(0, maxLength));
    requestAnimationFrame(() => {
      el.focus();
      const caret = t.line ? b + t.before.length : a + t.before.length + selected.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-coal">
      <div className="flex flex-wrap items-center gap-1 border-b border-edge px-2 py-1.5">
        {(['write', 'preview'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 text-xs font-semibold ${tab === t ? 'bg-gold-400 text-ink' : 'text-smoke hover:text-bone'}`}
          >
            {t === 'write' ? 'Write' : 'Preview'}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-edge" />
        {tab === 'write' &&
          TOOLS.map((t) => (
            <button
              key={t.title}
              type="button"
              title={t.title}
              onClick={() => apply(t)}
              className="min-w-7 rounded px-1.5 py-1 font-serif text-sm text-smoke hover:bg-white/5 hover:text-gold-200"
            >
              {t.label}
            </button>
          ))}
        <span className="ml-auto text-[10px] text-smoke/70">
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          className="block w-full resize-y bg-transparent px-4 py-3 font-serif text-lg leading-relaxed text-parchment outline-none placeholder:text-smoke/50"
          rows={rows}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="min-h-48 px-5 py-4">{value.trim() ? <LoreText>{value}</LoreText> : <p className="text-sm text-smoke">Nothing to preview.</p>}</div>
      )}
      <p className="border-t border-edge px-4 py-1.5 text-[11px] text-smoke/70">
        Tip: <code className="text-gold-300">[[Title]]</code> links an Archive entry, <code className="text-gold-300">@username</code> mentions a member.
      </p>
    </div>
  );
}
