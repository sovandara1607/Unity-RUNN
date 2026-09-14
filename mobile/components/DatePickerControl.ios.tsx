import { Host, DatePicker } from "@expo/ui/swift-ui";
import { datePickerStyle } from "@expo/ui/swift-ui/modifiers";
import { colors } from "../constants/theme";
import type { DatePickerControlProps } from "./DatePickerControl";

export default function DatePickerControl({
  value,
  onChange,
  maximumDate,
}: DatePickerControlProps) {
  return (
    <Host
      style={{ height: 216, width: "100%" }}
      colorScheme="dark"
      seedColor={colors.lime}
      ignoreSafeArea="all"
    >
      <DatePicker
        selection={value}
        onDateChange={onChange}
        displayedComponents={["date"]}
        range={{ start: new Date(1900, 0, 1), end: maximumDate }}
        modifiers={[datePickerStyle("wheel")]}
      />
    </Host>
  );
}
