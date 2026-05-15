import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

export function WikiPage() {
  const { pathname } = useLocation();
  const mdPath = pathname.replace('/wiki/', '');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(false);
    fetch(`./data/wiki/${mdPath}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, [mdPath]);

  if (error) {
    return <div className="text-text-muted text-sm">문서를 찾을 수 없습니다: {mdPath}</div>;
  }

  if (content === null) {
    return <div className="text-text-muted text-sm">Loading...</div>;
  }

  // Compute base path for relative links (e.g., "asset-factory/팩토리-파이프라인/" from "asset-factory/팩토리-파이프라인/README.md")
  const basePath = mdPath.includes('/') ? mdPath.substring(0, mdPath.lastIndexOf('/') + 1) : '';

  const components: Components = {
    a: ({ href, children, ...props }) => {
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        // Resolve relative link to hash router path
        const resolved = new URL(href, `http://x/${basePath}`).pathname.slice(1);
        return (
          <a href={`#/wiki/${resolved}`} className="text-accent hover:underline" {...props}>
            {children}
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" {...props}>
          {children}
        </a>
      );
    },
  };

  return (
    <div className="wiki-content max-w-[760px] mx-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
