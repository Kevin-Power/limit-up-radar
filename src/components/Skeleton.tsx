function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={`bg-bg-3 rounded animate-pulse ${className ?? ""}`}
    />
  );
}

function SkeletonGroupBlock() {
  return (
    <div className="bg-bg-1 border border-border rounded-lg mb-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2.5">
          <SkeletonBox className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <SkeletonBox className="w-32 h-3.5" />
            <SkeletonBox className="w-48 h-2.5" />
          </div>
        </div>
        <SkeletonBox className="w-3 h-3 mt-1" />
      </div>

      {/* Reason line */}
      <div className="px-4 pb-2.5 pl-[36px]">
        <SkeletonBox className="w-3/4 h-2.5" />
      </div>

      {/* Table header placeholder */}
      <div className="flex items-center gap-3 px-4 py-2 bg-bg-2 border-t border-b border-border">
        <SkeletonBox className="w-11 h-2" />
        <SkeletonBox className="w-24 h-2" />
        <SkeletonBox className="w-20 h-2 ml-auto" />
        <SkeletonBox className="w-16 h-2" />
      </div>

      {/* Row placeholders */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.02] last:border-b-0"
        >
          <SkeletonBox className="w-11 h-3 flex-shrink-0" />
          <SkeletonBox className="w-20 h-3 flex-shrink-0" />
          <SkeletonBox className="w-16 h-3 flex-shrink-0 ml-auto" />
          <SkeletonBox className="w-12 h-4 rounded flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function Skeleton() {
  return (
    <div>
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonGroupBlock key={i} />
      ))}
    </div>
  );
}
