import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

interface MarkdownOutputProps {
  content: string;
}

export const MarkdownOutput: React.FC<MarkdownOutputProps> = ({ content }) => {
  type CodeProps = React.ComponentPropsWithoutRef<"code"> & {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  };

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
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
                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
