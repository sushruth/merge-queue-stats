import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { filterOptions, matchOption } from '../core/options';

const VIEWPORT_MARGIN_PX = 8;

interface ComboboxProps {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  strict?: boolean;
  onCommit(text: string, explicit: boolean): void;
  onOpen?(): void;
  onSearch?(text: string): void;
}

export function Combobox({ label, value, options, placeholder, strict, onCommit, onOpen, onSearch }: ComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const listRef = useRef<HTMLUListElement>(null);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => setDraft(value), [value]);

  const shown = useMemo(() => (filtering ? filterOptions(options, draft) : options), [filtering, options, draft]);
  const activeIndex = active === null ? -1 : shown.indexOf(active);
  const showing = open && shown.length > 0;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !showing) return;
    list.style.transform = '';
    const overflow = list.getBoundingClientRect().right - (document.documentElement.clientWidth - VIEWPORT_MARGIN_PX);
    if (overflow > 0) list.style.transform = `translateX(${-overflow}px)`;
  }, [showing, shown]);

  useEffect(() => {
    if (showing && activeIndex >= 0) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [showing, activeIndex]);

  const show = (): void => {
    if (open) return;
    onOpen?.();
    setOpen(true);
    setFiltering(false);
    setActive(null);
  };
  const close = (): void => {
    setOpen(false);
    setActive(null);
  };
  const commit = (text: string, explicit: boolean): void => {
    close();
    if (strict) {
      const match = matchOption(options, text);
      setDraft(match ?? value);
      if (match) onCommit(match, explicit);
      return;
    }
    setDraft(text);
    onCommit(text, explicit);
  };
  const move = (step: 1 | -1): void => {
    const list = open ? shown : options;
    if (list.length === 0) return;
    const from = active === null ? -1 : list.indexOf(active);
    const start = from < 0 && step < 0 ? 0 : from;
    setActive(list[(start + step + list.length) % list.length]!);
  };
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      show();
      move(ev.key === 'ArrowDown' ? 1 : -1);
    } else if (ev.key === 'Enter') {
      commit(showing && activeIndex >= 0 ? active! : draft, true);
    } else if (ev.key === 'Escape') {
      close();
      setDraft(value);
    }
  };

  return (
    <div class="field">
      <label for={id}>{label}</label>
      <div class="combo">
        <span class="fit" data-value={draft || placeholder || ''}>
          <input
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showing}
            aria-controls={listId}
            aria-activedescendant={showing && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
            placeholder={placeholder}
            size={1}
            spellcheck={false}
            autocomplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={draft}
            onFocus={show}
            onClick={show}
            onBlur={() => commit(draft, false)}
            onKeyDown={onKeyDown}
            onInput={(ev) => {
              const text = ev.currentTarget.value;
              setDraft(text);
              setOpen(true);
              setFiltering(true);
              setActive(null);
              onSearch?.(text);
            }}
          />
        </span>
        <ul
          ref={listRef}
          id={listId}
          class="combo-list"
          role="listbox"
          aria-label={label}
          hidden={!showing}
          onMouseDown={(ev) => ev.preventDefault()}
        >
          {showing &&
            shown.map((option, index) => (
              <li
                key={option}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                class={option === value ? 'current' : undefined}
                onClick={() => commit(option, true)}
              >
                {option}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
