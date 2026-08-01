export function RoutePendingSkeleton() {
  return (
    <div className="w-full h-full p-4 md:p-6 space-y-6 animate-pulse select-none">
      {/* Skeleton Header / Title Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted/60 rounded-lg" />
          <div className="h-4 w-72 bg-muted/40 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-muted/50 rounded-lg" />
          <div className="h-9 w-28 bg-primary/20 rounded-lg" />
        </div>
      </div>

      {/* Skeleton Metric / Stat Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-border/40 bg-card/40 space-y-3 shadow-xs"
          >
            <div className="h-3.5 w-20 bg-muted/50 rounded-xs" />
            <div className="h-6 w-28 bg-muted/70 rounded-md" />
            <div className="h-3 w-16 bg-muted/30 rounded-xs" />
          </div>
        ))}
      </div>

      {/* Skeleton Content Table / List Area */}
      <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/30">
          <div className="h-9 w-64 bg-muted/50 rounded-lg" />
          <div className="h-9 w-32 bg-muted/40 rounded-lg" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 border-b border-border/20 last:border-0"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted/60" />
              <div className="space-y-1.5">
                <div className="h-4 w-36 bg-muted/60 rounded-xs" />
                <div className="h-3 w-24 bg-muted/30 rounded-xs" />
              </div>
            </div>
            <div className="h-6 w-20 bg-muted/40 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
