"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Six-box one-time-code input.
 *
 * Renders as six visible boxes but reports a single value through a hidden
 * field, so the server just reads one `code`. Paste of a full code fills every
 * box, and backspace on an empty box steps backwards — both are the difference
 * between this feeling native and feeling fiddly.
 */
export function OtpInput({
  name = "code",
  length = 6,
  autoFocus = true,
  onComplete,
}: {
  name?: string;
  length?: number;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
}) {
  const [digits, setDigits] = React.useState<string[]>(() => Array(length).fill(""));
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);

  const value = digits.join("");

  React.useEffect(() => {
    if (value.length === length) onComplete?.(value);
  }, [value, length, onComplete]);

  function setAt(index: number, digit: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      setAt(index, "");
      return;
    }

    // Typing over a filled box, or pasting several digits at once.
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, length - index).split("");
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((c, i) => (next[index + i] = c));
        return next;
      });
      refs.current[Math.min(index + chars.length, length - 1)]?.focus();
      return;
    }

    setAt(index, cleaned);
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setAt(index - 1, "");
      refs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Verification code">
      <input type="hidden" name={name} value={value} />
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1}`}
          className={cn(
            "h-12 w-11 rounded-lg border border-input bg-background text-center font-mono text-lg shadow-sm outline-none transition-colors",
            "focus:border-primary/50 focus:ring-2 focus:ring-ring/25",
            digit && "border-primary/40",
          )}
        />
      ))}
    </div>
  );
}
