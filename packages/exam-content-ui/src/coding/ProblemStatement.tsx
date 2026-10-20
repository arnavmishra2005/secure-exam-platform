/**
 * Owner: Person B. Problem statement (Markdown) + sample tests + limits.
 * react-markdown never renders raw HTML. Links render as plain text and
 * images as their alt text, so nothing in a statement can navigate away or
 * load external content (kiosk-safe).
 */
import ReactMarkdown from 'react-markdown';
import type { PublicCodingProblem } from '@secure-exam/types';

export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc">
      <ReactMarkdown
        components={{
          a: ({ children }) => <span className="underline decoration-dotted">{children}</span>,
          img: ({ alt }) => <span className="italic text-muted-foreground">[{alt || 'image'}]</span>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export function SampleBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-xs text-foreground">
        {text === '' ? <span className="italic text-muted-foreground">(empty)</span> : text}
      </pre>
    </div>
  );
}

export function ProblemStatement({
  title,
  marks,
  problem,
}: {
  title: string;
  marks: number;
  problem: PublicCodingProblem;
}) {
  return (
    <article className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {marks} marks · time limit {problem.timeLimitMs / 1000} s per test · memory {problem.memoryLimitMb} MB ·
          Python 3.12, standard library only
        </p>
      </header>
      <Markdown source={problem.statementMd} />
      {problem.samples.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Examples</h3>
          {problem.samples.map((s) => (
            <div key={s.index} className="flex flex-col gap-2 sm:flex-row">
              <SampleBlock label={`Input ${s.index}`} text={s.input} />
              <SampleBlock label={`Output ${s.index}`} text={s.expectedOutput} />
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
