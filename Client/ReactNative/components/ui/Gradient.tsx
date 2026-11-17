import React, { useId } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { promoGradient } from "@/constants/theme";

/**
 * The website's orange-to-gold gradient, drawn behind a view's content (react-native-svg, already in
 * the app: no new native module). Left to right by default; it fills its parent and takes no touches.
 */
const Gradient: React.FC<{
  colors?: readonly string[];
  vertical?: boolean;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ colors = promoGradient, vertical = false, borderRadius = 0, style }) => {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}>
            {colors.map((color, i) => (
              <Stop key={color + i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
};

export default Gradient;
