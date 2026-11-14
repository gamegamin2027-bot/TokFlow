import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { Block } from "@/lib/i18n/pages/fr";

/** Met en forme le gras (**texte**) et les liens internes ([texte](/chemin)) des textes traduits. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)]*\))/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\((\/[^)]*)\)$/.exec(part);
    if (link) return <Link key={i} href={link[2]}>{link[1]}</Link>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Affiche le corps d'une page secondaire : titres, paragraphes et listes. */
export function RichBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if ("h" in block) return <h2 key={i}>{block.h}</h2>;
        if ("p" in block) return <p key={i}>{inline(block.p)}</p>;
        return (
          <ul key={i}>
            {block.ul.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        );
      })}
    </>
  );
}
