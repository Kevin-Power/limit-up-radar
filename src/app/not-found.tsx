import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-8xl font-bold text-txt-4">404</div>
        <h2 className="text-xl font-semibold">頁面不存在</h2>
        <p className="text-txt-3">找不到你要的頁面</p>
        <Link href="/" className="inline-block px-6 py-2 bg-red text-white rounded-lg hover:bg-red/80 transition-colors">
          回到首頁
        </Link>
      </div>
    </div>
  );
}
