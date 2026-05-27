import React, { useEffect, useState } from 'react';
import styles from './settings-components.module.css';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: 'int' | 'float';
  fieldWidth?: 'default' | 'wide';
  disabled?: boolean;
  /** 为 true 时仅在失焦或 Enter 时调用 onChange，避免输入过程中多次保存 */
  commitOnBlur?: boolean;
}

function parseFieldValue(raw: string, precision: 'int' | 'float'): number {
  return precision === 'float' ? parseFloat(raw) : parseInt(raw, 10);
}

function clampFieldValue(value: number, min?: number, max?: number): number {
  let next = value;
  if (min != null) next = Math.max(min, next);
  if (max != null) next = Math.min(max, next);
  return next;
}

export function NumberInput({
  value,
  onChange,
  unit,
  min,
  max,
  step,
  precision = 'int',
  fieldWidth = 'default',
  disabled,
  commitOnBlur = false,
}: NumberInputProps) {
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    if (commitOnBlur) setDraft(String(value));
  }, [value, commitOnBlur]);

  const commitDraft = () => {
    const parsed = parseFieldValue(draft, precision);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = clampFieldValue(parsed, min, max);
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (commitOnBlur) {
      setDraft(raw);
      return;
    }
    const next = parseFieldValue(raw, precision);
    if (!Number.isFinite(next)) return;
    onChange(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!commitOnBlur || event.key !== 'Enter') return;
    event.preventDefault();
    commitDraft();
    event.currentTarget.blur();
  };

  const inputClassName = [
    styles.numberInputField,
    fieldWidth === 'wide' && styles.numberInputFieldWide,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.numberInput}>
      <input
        type="number"
        className={inputClassName}
        value={commitOnBlur ? draft : value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={handleChange}
        onBlur={commitOnBlur ? commitDraft : undefined}
        onKeyDown={handleKeyDown}
      />
      {unit && <span className={styles.numberInputUnit}>{unit}</span>}
    </div>
  );
}
