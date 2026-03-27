"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-6xl text-red font-bold">!</div>
        <h2 className="text-xl font-semibold">發生錯誤</h2>
        <p className="text-txt-3 max-w-md">{error.message || "頁面載入失敗，請稍後再試"}</p>
        <button onClick={reset} className="px-6 py-2 bg-red text-white rounded-lg hover:bg-red/80 transition-colors">
          重新載入
        </button>
      </div>
    </div>
  );
}
