export function SkeletonLine({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="ui-skeleton"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="surface-card ui-skeleton-card" aria-busy="true" aria-label="Đang tải nội dung">
      <SkeletonLine width="42%" height={20} />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={i % 2 === 0 ? '90%' : '72%'} height={14} />
      ))}
    </div>
  );
}
