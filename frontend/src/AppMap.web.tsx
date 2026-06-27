/**
 * Web fallback map — stylized gradient pseudo-map with positioned pins.
 */
import React, { forwardRef } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "./theme";

export type Facility = {
  id: string;
  name: string;
  type: "clinic" | "pharmacy";
  latitude: number;
  longitude: number;
  verified?: boolean;
};

type MapProps = {
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  facilities: Facility[];
  onSelect?: (id: string) => void;
  userLocation?: { latitude: number; longitude: number } | null;
};

export const AppMap = forwardRef<any, MapProps>(({ facilities, onSelect, userLocation }, _ref) => {
  return (
    <View style={StyleSheet.absoluteFill} testID="map-web-fallback">
      <LinearGradient
        colors={["#E5F0E9", "#D8E9DD", "#C7DDD0"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.road, { top: "30%", transform: [{ rotate: "8deg" }] }]} />
      <View style={[styles.road, { top: "55%", transform: [{ rotate: "-12deg" }] }]} />
      <View style={[styles.road, { top: "75%", transform: [{ rotate: "5deg" }] }]} />
      <View style={[styles.roadV, { left: "30%" }]} />
      <View style={[styles.roadV, { left: "65%" }]} />
      {userLocation ? (
        <View style={styles.userDotWrap} pointerEvents="none">
          <View style={styles.userPulse} />
          <View style={styles.userDot} />
        </View>
      ) : null}
      {facilities.slice(0, 12).map((f, idx) => {
        const top = 18 + ((idx * 37) % 65);
        const left = 12 + ((idx * 53) % 75);
        return (
          <Pressable
            key={f.id}
            onPress={() => onSelect?.(f.id)}
            testID={`map-pin-${f.id}`}
            style={[
              styles.pin,
              { top: `${top}%`, left: `${left}%`, backgroundColor: f.type === "clinic" ? colors.brand : colors.warning },
            ]}
          >
            <Text style={styles.pinText}>{f.type === "clinic" ? "C" : "P"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
});

AppMap.displayName = "AppMap";

const styles = StyleSheet.create({
  road: { position: "absolute", left: "-10%", right: "-10%", height: 3, backgroundColor: "#FFFFFF", opacity: 0.6 },
  roadV: { position: "absolute", top: 0, bottom: 0, width: 3, backgroundColor: "#FFFFFF", opacity: 0.5 },
  pin: {
    position: "absolute", width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFFFFF",
    shadowColor: "#0F2A1C", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  pinText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  userDotWrap: {
    position: "absolute", top: "50%", left: "50%", marginLeft: -10, marginTop: -10,
    width: 20, height: 20, alignItems: "center", justifyContent: "center",
  },
  userDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#2D7DEF", borderWidth: 3, borderColor: "#FFFFFF" },
  userPulse: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: "#2D7DEF", opacity: 0.18 },
});
