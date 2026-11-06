export interface LegendItem {
  label: string;
  color: string;
  thin?: boolean;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div class="legend">
      {items.map((item) => (
        <span key={item.label}>
          <i class={item.thin ? 'key key-thin' : 'key'} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
