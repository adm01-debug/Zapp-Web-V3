import { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (formatted: string, raw: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Formats a raw digit string into Brazilian phone format:
 *   +55 XX XXXXX-XXXX  (mobile, 11 digits)
 *   +55 XX XXXX-XXXX   (landline, 10 digits)
 *   +CC XXXXXXXXX      (international, passthrough)
 */
function formatPhone(digits: string): string {
  if (!digits) return '';

  // If starts with 55 and has 12-13 digits, format as BR
  if (digits.startsWith('55') && digits.length >= 4) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length <= 5) {
      return `+55 ${ddd} ${rest}`;
    }
    if (rest.length <= 9) {
      // Mobile: 9XXXX-XXXX
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    // Cap at 9 digits after DDD
    const capped = rest.slice(0, 9);
    return `+55 ${ddd} ${capped.slice(0, 5)}-${capped.slice(5)}`;
  }

  // Partial: user just started typing
  if (digits.length <= 2) return `+${digits}`;
  if (digits.length <= 4) return `+${digits.slice(0, 2)} ${digits.slice(2)}`;

  // International or incomplete
  return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
}

/**
 * Extracts only digits from a string.
 */
function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Phone input with Brazilian mask (+55 XX XXXXX-XXXX).
 * - Auto-prefixes +55 when user starts typing
 * - Only allows digits
 * - Formats in real-time
 * - `onChange` provides both formatted and raw (digits-only) values
 */
export function PhoneInput({ value, onChange, placeholder = '+55 11 99999-0000', className, disabled }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(() => {
    const digits = extractDigits(value);
    return digits ? formatPhone(digits) : '';
  });

  // Sync external value changes
  useEffect(() => {
    const digits = extractDigits(value);
    const formatted = digits ? formatPhone(digits) : '';
    if (formatted !== displayValue) {
      setDisplayValue(formatted);
    }
  }, [value, displayValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    let digits = extractDigits(raw);

    // Auto-prefix 55 if user starts typing a DDD directly (e.g. "11...")
    if (digits.length >= 2 && !digits.startsWith('55')) {
      // Check if it looks like a BR DDD (11-99)
      const possibleDDD = parseInt(digits.slice(0, 2), 10);
      if (possibleDDD >= 11 && possibleDDD <= 99) {
        digits = '55' + digits;
      }
    }

    // Cap at 13 digits (55 + 2 DDD + 9 number)
    if (digits.length > 13) digits = digits.slice(0, 13);

    const formatted = formatPhone(digits);
    setDisplayValue(formatted);
    onChange(formatted, digits);
  }, [onChange]);

  const handleFocus = useCallback(() => {
    // If empty, pre-fill with +55
    if (!displayValue) {
      const formatted = '+55 ';
      setDisplayValue(formatted);
      onChange(formatted, '55');
    }
  }, [displayValue, onChange]);

  return (
    <Input
      ref={inputRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      disabled={disabled}
      className={cn(' tracking-wide', className)}
    />
  );
}
