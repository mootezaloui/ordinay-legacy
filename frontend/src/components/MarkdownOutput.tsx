import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { openExternalLink } from "../lib/externalLink";

interface MarkdownOutputProps {
  content: string;
}

function normalizeMarkdownForRender(content: string): string {
  let text = String(content || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return "";

  // Preserve explicit single line breaks as markdown hard breaks for chat readability,
  // while keeping block structures (lists/headings/tables/quotes) intact.
  text = text.replace(
    /([^\n])\n(?!\n|[#>*\-+]|\d+\.\s|\|)/g,
    "$1  \n",
  );

  return text;
}

export const MarkdownOutput: React.FC<MarkdownOutputProps> = ({ content }) => {
  type CodeProps = React.ComponentPropsWithoutRef<"code"> & {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  };
  type AnchorProps = React.ComponentPropsWithoutRef<"a"> & {
    children?: React.ReactNode;
  };

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none break-words text-[inherit] leading-[inherit] font-[inherit]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code({ inline, className, children, ...props }: CodeProps) {
            return !inline ? (
              <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto my-2 border">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-[inherit] font-[inherit]"
                {...props}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="w-full border-collapse text-sm">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border p-2 text-left font-semibold bg-muted">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="border p-2 align-top">{children}</td>;
          },
          a({ href, children }: AnchorProps) {
            const safeHref = typeof href === "string" ? href : "";
            return (
              <a
                href={safeHref}
                rel="noopener noreferrer nofollow"
                onClick={(event) => {
                  event.preventDefault();
                  if (!safeHref) return;
                  void openExternalLink(safeHref, "markdown_link");
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {normalizeMarkdownForRender(content)}
      </ReactMarkdown>
    </div>
  );
};
