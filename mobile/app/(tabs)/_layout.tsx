import type { ComponentProps } from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SFSymbol } from "sf-symbols-typescript";
import { colors, fonts } from "../../constants/theme";

const { Trigger } = NativeTabs;
const { VectorIcon } = Trigger;
type IoniconName = ComponentProps<typeof Ionicons>["name"];

function tabIcon(
  outline: IoniconName,
  filled: IoniconName,
  sf: { default: SFSymbol; selected: SFSymbol },
) {
  return (
    <Trigger.Icon
      sf={sf}
      src={{
        default: <VectorIcon family={Ionicons} name={outline} />,
        selected: <VectorIcon family={Ionicons} name={filled} />,
      }}
    />
  );
}

export default function TabLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.canvas}
      tintColor={colors.lime}
      iconColor={{ default: colors.muted, selected: colors.lime }}
      labelStyle={{
        default: { fontFamily: fonts.bold, fontSize: 11, color: colors.muted },
        selected: { fontFamily: fonts.bold, fontSize: 11, color: colors.lime },
      }}
    >
      <Trigger name="index">
        <Trigger.Label>Events</Trigger.Label>
        {tabIcon("flag-outline", "flag", { default: "flag", selected: "flag.fill" })}
      </Trigger>
      <Trigger name="wallet">
        <Trigger.Label>Wallet</Trigger.Label>
        {tabIcon("ticket-outline", "ticket", { default: "ticket", selected: "ticket.fill" })}
      </Trigger>
      <Trigger name="account">
        <Trigger.Label>Profile</Trigger.Label>
        {tabIcon("person-outline", "person", { default: "person", selected: "person.fill" })}
      </Trigger>
    </NativeTabs>
  );
}
