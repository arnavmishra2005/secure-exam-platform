/** Owner: Person B. Free-form tags with suggestions from existing tags. */
import { useId, useState, type KeyboardEvent } from 'react';
import { Input } from '../ui';
import { useTags } from './hooks';

export function TagInput({
  value,
  onChange,
  disabled,
  max = 20,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const { data: suggestions } = useTags(draft.trim().toLowerCase());

  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 50);
    if (tag && !value.includes(tag) && value.length < max) onChange([...value, tag]);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {value.map((t) => (
            <li key={t} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-foreground">
              {t}
              {!disabled && (
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Input
        aria-label="Add tag"
        list={listId}
        placeholder={value.length >= max ? `At most ${max} tags` : 'Type a tag and press Enter'}
        value={draft}
        disabled={disabled || value.length >= max}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && add(draft)}
      />
      <datalist id={listId}>
        {(suggestions ?? [])
          .filter((s) => !value.includes(s.tag))
          .map((s) => (
            <option key={s.tag} value={s.tag}>{`${s.tag} (${s.count})`}</option>
          ))}
      </datalist>
    </div>
  );
}
