"use client";

interface StarButtonProps {
  code: string;
  isWatched: boolean;
  onToggle: (code: string) => void;
  size?: "sm" | "md";
}

export default function StarButton({ code, isWatched, onToggle, size = "sm" }: StarButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle(code);
      }}
      className={`flex-shrink-0 transition-all duration-200 ease-out hover:scale-125 active:scale-95 ${
        size === "md" ? "w-6 h-6" : "w-4 h-4"
      }`}
      title={isWatched ? "從自選股移除" : "加入自選股"}
      aria-label={isWatched ? `從自選股移除 ${code}` : `加入自選股 ${code}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={isWatched ? "#facc15" : "none"}
        stroke={isWatched ? "#facc15" : "#6b7280"}
        strokeWidth={isWatched ? 1 : 1.5}
        className={`w-full h-full transition-all duration-200 ${
          isWatched ? "drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]" : "hover:stroke-yellow-400/60"
        }`}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        />
      </svg>
    </button>
  );
}
