// Web shim for expo-symbols (iOS SF Symbols — not available on web)
// Returns a transparent placeholder View so layout is not broken
import React from "react";
import { View } from "react-native";

export function SymbolView({ style, size, ...rest }) {
  const sz = size ?? 24;
  return <View style={[{ width: sz, height: sz }, style]} />;
}

export function SymbolImage({ style, size, ...rest }) {
  const sz = size ?? 24;
  return <View style={[{ width: sz, height: sz }, style]} />;
}
