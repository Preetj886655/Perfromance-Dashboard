import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";

interface AnimatedCounterProps {
  value: string | number;
  duration?: number;
  className?: string;
}

/**
 * Extracts numeric parts, prefix, and suffix from formatted string values.
 * e.g., "1,240.50 NOS" -> { prefix: "", num: 1240.5, decimals: 2, suffix: " NOS" }
 * e.g., "+84.2%" -> { prefix: "+", num: 84.2, decimals: 1, suffix: "%" }
 * e.g., "-12 min" -> { prefix: "-", num: 12, decimals: 0, suffix: " min" }
 */
function parseValueParts(val: string | number) {
  if (typeof val === "number") {
    return { prefix: "", num: val, decimals: Number.isInteger(val) ? 0 : 2, suffix: "" };
  }

  const str = String(val).trim();
  // Match prefix (+, -, ▲, ▼, etc.), number with commas/decimals, and suffix
  const match = str.match(/^([+\-▲▼₹$€£\s]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) {
    return null;
  }

  const prefix = match[1];
  const numStr = match[2].replace(/,/g, "");
  const num = parseFloat(numStr);
  const suffix = match[3];

  const decimalPart = numStr.split(".")[1];
  const decimals = decimalPart ? decimalPart.length : 0;

  return { prefix, num, decimals, suffix };
}

function formatWithCommas(num: number, decimals: number): string {
  const fixed = num.toFixed(decimals);
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

export function AnimatedCounter({
  value,
  duration = 0.8,
  className,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState<string>(() => String(value));
  const prevValueRef = useRef<number | null>(null);

  useEffect(() => {
    // Check user preference for reduced motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const parsed = parseValueParts(value);
    if (!parsed || isNaN(parsed.num) || prefersReducedMotion) {
      setDisplayValue(String(value));
      return;
    }

    const { prefix, num, decimals, suffix } = parsed;
    const startNum = prevValueRef.current !== null ? prevValueRef.current : 0;
    prevValueRef.current = num;

    if (startNum === num) {
      setDisplayValue(`${prefix}${formatWithCommas(num, decimals)}${suffix}`);
      return;
    }

    const controls = animate(startNum, num, {
      duration: Math.min(Math.max(duration, 0.3), 1.2),
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        setDisplayValue(`${prefix}${formatWithCommas(latest, decimals)}${suffix}`);
      },
    });

    return () => controls.stop();
  }, [value, duration]);

  return <span className={className}>{displayValue}</span>;
}
