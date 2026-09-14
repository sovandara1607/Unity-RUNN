import DateTimePicker from "@expo/ui/community/datetime-picker";
import { colors } from "../constants/theme";

export type DatePickerControlProps = {
  value: Date;
  onChange(date: Date): void;
  maximumDate: Date;
};

export default function DatePickerControl({
  value,
  onChange,
  maximumDate,
}: DatePickerControlProps) {
  return (
    <DateTimePicker
      value={value}
      onValueChange={(_, date) => onChange(date)}
      mode="date"
      presentation="inline"
      display="default"
      minimumDate={new Date(1900, 0, 1)}
      maximumDate={maximumDate}
      accentColor={colors.lime}
      themeVariant="dark"
      style={{ height: 400 }}
    />
  );
}
