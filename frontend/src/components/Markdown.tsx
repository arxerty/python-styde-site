import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Element, ElementContent } from "hast";
import { RunnableCode } from "./RunnableCode";

interface Props {
  children: string;
  /** Показывать кнопку «Запустить» у блоков ```python */
  runnable?: boolean;
}

function hastText(node: ElementContent | Element): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return node.children.map((child) => hastText(child as ElementContent)).join("");
  return "";
}

export function Markdown({ children, runnable = false }: Props) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre({ node, children: rendered }) {
            const codeEl = node?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
            const classes = (codeEl?.properties?.className as string[] | undefined) ?? [];
            const isPython = classes.includes("language-python");
            const meta = String((codeEl?.data as { meta?: string } | undefined)?.meta ?? "");
            const canRun = isPython && !meta.includes("norun") && (runnable || meta.includes("run"));
            if (codeEl && canRun) {
              return <RunnableCode code={hastText(codeEl).replace(/\n$/, "")}>{rendered}</RunnableCode>;
            }
            return <pre>{rendered}</pre>;
          },
          a({ href, children: text }) {
            const external = href?.startsWith("http");
            return (
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
                {text}
              </a>
            );
          },
          table({ children: rows }) {
            return (
              <div className="table-wrap">
                <table>{rows}</table>
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
