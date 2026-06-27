/**
 * Native map — react-native-maps wrapper.
 */
import React, { forwardRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
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

export const AppMap = forwardRef<MapView, MapProps>(({ region, facilities, onSelect }, ref) => {
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {facilities.map((f) => (
        <Marker
          key={f.id}
          coordinate={{ latitude: f.latitude, longitude: f.longitude }}
          onPress={() => onSelect?.(f.id)}
          pinColor={f.type === "clinic" ? colors.brand : colors.warning}
          testID={`map-pin-${f.id}`}
        />
      ))}
    </MapView>
  );
});

AppMap.displayName = "AppMap";
