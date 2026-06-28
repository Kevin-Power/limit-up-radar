"use client";

import dynamic from "next/dynamic";
import { SkeletonBox } from "@/components/Skeleton";

// Heavy client-only fullscreen map (1800+ lines) — code-split to keep first-load
// bundle small (audit P2-7). ssr:false requires a client boundary, hence this wrapper.
const SupplyChainMap = dynamic(() => import("@/components/SupplyChainMap"), {
  ssr: false,
  loading: () => <SkeletonBox className="w-screen h-screen rounded-none" />,
});

export default function SupplyChainMapClient() {
  return <SupplyChainMap />;
}
