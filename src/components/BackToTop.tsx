"use client";

import { useEffect, useRef, useState } from "react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  // Reference to the scrollable main container
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    // Find the scrollable main element (the flex-1 overflow-y-auto div)
    const main = document.querySelector("main.flex-1") ?? document.querySelector("main");
    if (!main) return;
    targetRef.current = main;

    function handleScroll() {
      if (targetRef.current) {
        setVisible(targetRef.current.scrollTop > 300);
      }
    }

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    targetRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      onClick={scrollToTop}
      aria-label="回到頂部"
      className={`fixed bottom-16 right-5 z-40 w-8 h-8 rounded-full bg-bg-3 border border-border text-txt-4 hover:border-border-hover hover:text-txt-1 transition-all duration-200 flex items-center justify-center shadow-lg ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 8L6 4L10 8" />
      </svg>
    </button>
  );
}
