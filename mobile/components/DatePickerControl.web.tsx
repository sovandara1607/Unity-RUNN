import type { DatePickerControlProps } from "./DatePickerControl";
import { formatDateValue, parseDateValue } from "./dateValue";
import { colors } from "../constants/theme";

export default function DatePickerControl({
  value,
  onChange,
  maximumDate,
}: DatePickerControlProps) {
  return (
    <input
      type="date"
      aria-label="Date of birth"
      min="1900-01-01"
      max={formatDateValue(maximumDate)}
      value={formatDateValue(value)}
      onChange={(event) => {
        const date = parseDateValue(event.target.value);
        if (date && date <= maximumDate && date.getFullYear() >= 1900)
          onChange(date);
      }}
      style={{
        colorScheme: "dark",
        width: "100%",
        boxSizing: "border-box",
        padding: 20,
        marginBlock: 24,
        fontSize: 20,
        color: colors.white,
        background: colors.canvas,
        border: `1px solid ${colors.muted}`,
        borderRadius: 12,
      }}
    />
  );
}
