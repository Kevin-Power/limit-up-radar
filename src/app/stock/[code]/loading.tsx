export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-pulse">
      <div className="h-9 bg-bg-1 border-b border-border" />
      <div className="h-9 bg-bg-1 border-b border-border" />
      <div className="p-5 space-y-4">
        <div className="h-6 w-24 bg-bg-2 rounded" />
        <div className="h-20 bg-bg-1 rounded-lg" />
        <div className="h-64 bg-bg-1 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-16 bg-bg-1 rounded" />)}
        </div>
      </div>
    </div>
  );
}
