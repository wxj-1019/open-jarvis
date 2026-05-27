// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../settings/components/settings-components.module.css', () => ({
  default: {
    numberInput: 'numberInput',
    numberInputField: 'numberInputField',
    numberInputUnit: 'numberInputUnit',
  },
}));

import { NumberInput } from '../../settings/components/NumberInput';

describe.sequential('NumberInput commitOnBlur', () => {
  afterEach(() => cleanup());

  it('commits on blur, not on each keystroke', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NumberInput value={100} onChange={onChange} commitOnBlur min={75} max={150} />,
    );

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '125' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(125);

    rerender(<NumberInput value={125} onChange={onChange} commitOnBlur min={75} max={150} />);
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('125');
  });

  it('commits on Enter', () => {
    const onChange = vi.fn();
    render(<NumberInput value={100} onChange={onChange} commitOnBlur min={75} max={150} />);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '110' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(110);
  });
});
