"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";

export function TrackedStockLink(props: {
  code: string;
  name: string;
  source: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/stock/${props.code}`}
      className={props.className}
      onClick={() =>
        track("stock_view", { code: props.code, name: props.name, source: props.source })
      }
    >
      {props.children}
    </Link>
  );
}
