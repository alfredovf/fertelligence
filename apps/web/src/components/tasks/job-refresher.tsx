"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Mientras el worker trabaja, vuelve a pedir la página cada 2 segundos.
export function JobRefresher() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => s + 2);
      router.refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [router]);
  return <span className="tabular-nums">{seconds} s</span>;
}
