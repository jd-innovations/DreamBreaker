"use client";

// Three-part date entry, ported from
// `apps/mobile/src/lib/onboarding/DateOfBirthField.web.tsx`.
//
// Separate MM / DD / YYYY inputs rather than `<input type="date">`: the native
// picker is inconsistent across browsers, defaults to the current year (wrong
// for a birth date by decades), and is awkward with a keyboard.
//
// The validation is the part worth keeping — constructing the Date and checking
// `getMonth()` matches is what rejects 31 February, which a range check alone
// lets through.

import { useEffect, useState } from "react";

const inputCls =
  "h-12 rounded-xl bg-secondary border border-border px-3 text-sm text-center outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow tabular-nums";

function toIso(m: string, d: string, y: string): string | null {
  if (m.length === 0 || d.length === 0 || y.length !== 4) return null;

  const mNum = Number(m);
  const dNum = Number(d);
  const yNum = Number(y);
  if (!mNum || !dNum || !yNum) return null;
  if (mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return null;

  const candidate = new Date(yNum, mNum - 1, dNum);
  // Rolls over on an impossible date (Feb 31 becomes Mar 3), so compare back.
  if (
    candidate.getFullYear() !== yNum ||
    candidate.getMonth() !== mNum - 1 ||
    candidate.getDate() !== dNum
  ) {
    return null;
  }
  if (candidate >= new Date()) return null;

  const mm = String(mNum).padStart(2, "0");
  const dd = String(dNum).padStart(2, "0");
  return `${yNum}-${mm}-${dd}`;
}

export function DateOfBirthField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const [month, setMonth] = useState(() => (value ? value.slice(5, 7) : ""));
  const [day, setDay] = useState(() => (value ? value.slice(8, 10) : ""));
  const [year, setYear] = useState(() => (value ? value.slice(0, 4) : ""));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    onChange(toIso(month, day, year));
    // onChange identity is stable enough here; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, year]);

  const complete = month.length > 0 && day.length > 0 && year.length === 4;
  const invalid = touched && complete && toIso(month, day, year) === null;

  const digits = (raw: string, max: number) => raw.replace(/\D/g, "").slice(0, max);

  return (
    <div>
      <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">
        DATE OF BIRTH
      </label>
      <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2 max-w-xs">
        <input
          value={month}
          onChange={(e) => setMonth(digits(e.target.value, 2))}
          onBlur={() => setTouched(true)}
          placeholder="MM"
          // inputMode raises the numeric keypad on phones; autoComplete lets
          // them fill it from the OS.
          inputMode="numeric"
          autoComplete="bday-month"
          aria-label="Birth month"
          data-testid="onboarding-dob-month"
          className={inputCls}
        />
        <input
          value={day}
          onChange={(e) => setDay(digits(e.target.value, 2))}
          onBlur={() => setTouched(true)}
          placeholder="DD"
          inputMode="numeric"
          autoComplete="bday-day"
          aria-label="Birth day"
          data-testid="onboarding-dob-day"
          className={inputCls}
        />
        <input
          value={year}
          onChange={(e) => setYear(digits(e.target.value, 4))}
          onBlur={() => setTouched(true)}
          placeholder="YYYY"
          inputMode="numeric"
          autoComplete="bday-year"
          aria-label="Birth year"
          data-testid="onboarding-dob-year"
          className={inputCls}
        />
      </div>
      {invalid && (
        <p className="text-xs text-destructive mt-2">
          That date doesn&apos;t exist. Check the day and year.
        </p>
      )}
    </div>
  );
}
