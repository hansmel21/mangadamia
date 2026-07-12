import { router } from "expo-router";
import type { StyleProp, TextStyle } from "react-native";
import { Text } from "react-native";
import { colors } from "../theme";

const TOKEN = /([@#][a-zA-Z0-9_]{2,40})/g;

export function LinkedText({
  children,
  style,
  linkStyle,
  numberOfLines,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const parts = children.split(TOKEN).filter((part) => part.length > 0);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        const marker = part[0];
        const value = part.slice(1);
        if (marker === "@" && /^[a-zA-Z0-9_]{3,20}$/.test(value)) {
          return (
            <Text
              key={`${part}-${i}`}
              style={[{ color: colors.accentSoft, fontWeight: "800" }, linkStyle]}
              onPress={() => router.push({ pathname: "/user/[username]", params: { username: value } })}
            >
              {part}
            </Text>
          );
        }
        if (marker === "#" && /^[a-zA-Z0-9_]{2,40}$/.test(value)) {
          return (
            <Text
              key={`${part}-${i}`}
              style={[{ color: colors.fresh, fontWeight: "800" }, linkStyle]}
              onPress={() => router.push({ pathname: "/feed", params: { topic: value } })}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}
