import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { useLore } from '../hooks/useLore';
import { MemberName } from './MemberName';

/*
 * Renders lore markdown. Raw HTML is never rendered (react-markdown escapes it),
 * so member-written text can't inject scripts. Two lore extensions:
 *   [[Article Title]] or [[Article Title|shown text]]  → link to that Archive entry
 *   @username                                          → member link with hover card
 */

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const TOKEN = /\[\[([^\]|]{1,120})(?:\|([^\]]{1,120}))?\]\]|(^|[^\w@])@([a-zA-Z0-9_.]{3,20})/g;

function splitText(value: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(TOKEN)) {
    const [whole, title, label, lead, username] = m;
    let start = m.index!;
    if (username !== undefined) start += lead.length; // keep the character before @
    if (start > last) out.push({ type: 'text', value: value.slice(last, start) });
    if (title !== undefined) {
      out.push({ type: 'link', url: `lore:${encodeURIComponent(title.trim())}`, children: [{ type: 'text', value: (label ?? title).trim() }] });
    } else {
      out.push({ type: 'link', url: `member:${username.toLowerCase()}`, children: [{ type: 'text', value: `@${username}` }] });
    }
    last = m.index! + whole.length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function transform(node: MdNode) {
  if (!node.children || node.type === 'link' || node.type === 'code' || node.type === 'inlineCode') return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && child.value) return splitText(child.value);
    transform(child);
    return [child];
  });
}

const remarkLoreLinks = () => (tree: MdNode) => transform(tree);

const urlTransform = (url: string) => (/^(lore|member):/.test(url) ? url : defaultUrlTransform(url));

export function LoreText({ children, className = '', dropCap = false }: { children: string; className?: string; dropCap?: boolean }) {
  const { loreByTitle, memberByUsername } = useLore();
  return (
    <div className={`lore-prose ${dropCap ? 'drop-cap' : ''} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkLoreLinks]}
        urlTransform={urlTransform}
        components={{
          img: () => null,
          a: ({ href = '', children }) => {
            if (href.startsWith('lore:')) {
              const entry = loreByTitle.get(decodeURIComponent(href.slice(5)).toLowerCase());
              return entry ? (
                <Link to={`/archive/${entry.id}`}>{children}</Link>
              ) : (
                <a className="missing" title="No Archive entry with this title yet">
                  {children}
                </a>
              );
            }
            if (href.startsWith('member:')) {
              const m = memberByUsername.get(href.slice(7));
              return m ? <MemberName id={m.id} /> : <span>{children}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
