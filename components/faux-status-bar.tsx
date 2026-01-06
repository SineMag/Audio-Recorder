import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function FauxStatusBar() {
  const textColor = useThemeColor({}, "text");

  return (
    <View style={styles.container}>
      <Text style={[styles.time, { color: textColor }]}>9:41</Text>
      <View style={styles.right}>
        <View style={styles.signalBars}>
          <View
            style={[styles.bar, { height: 4, backgroundColor: textColor }]}
          />
          <View
            style={[styles.bar, { height: 8, backgroundColor: textColor }]}
          />
          <View
            style={[styles.bar, { height: 12, backgroundColor: textColor }]}
          />
          <View
            style={[styles.bar, { height: 16, backgroundColor: textColor }]}
          />
        </View>
        <Ionicons
          name="wifi"
          size={18}
          color={textColor}
          style={{ marginLeft: 8 }}
        />
        <Ionicons
          name="battery-full"
          size={22}
          color={textColor}
          style={{ marginLeft: 8 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  time: {
    fontWeight: "600",
    fontSize: 16,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
  },
  signalBars: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  bar: {
    width: 3,
    borderRadius: 1,
    marginHorizontal: 1,
  },
});
