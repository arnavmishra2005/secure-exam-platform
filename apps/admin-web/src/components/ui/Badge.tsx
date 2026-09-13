// [SHARED — scaffold together Day 0]

type Tone = 'gold' | 'verdigris' | 'brick' | 'neutral';

const toneClasses: Record<Tone, string> = {
  gold: 'bg-gold-light text-gold border-gold/30',
  verdigris: 'bg-verdigris-light text-verdigris-dark border-verdigris/30',
  brick: 'bg-brick-light text-brick border-brick/30',
  neutral: 'bg-paper text-ash-muted border-hairline',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
