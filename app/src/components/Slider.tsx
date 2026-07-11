// Minimal dependency-free slider, used by the reader for page scrubbing and
// screen brightness. Drag anywhere on the track; onChange fires while
// dragging, onChangeEnd on release.
import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { colors } from "../theme";

export function Slider({
  value,
  min = 0,
  max = 1,
  onChange,
  onChangeEnd,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange?: (v: number) => void;
  onChangeEnd?: (v: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const valueAt = (x: number) => {
    const w = widthRef.current || 1;
    const f = Math.min(1, Math.max(0, x / w));
    return min + f * (max - min);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange?.(valueAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onChange?.(valueAt(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => onChangeEnd?.(valueAt(e.nativeEvent.locationX)),
      onPanResponderTerminate: (e) => onChangeEnd?.(valueAt(e.nativeEvent.locationX)),
    }),
  ).current;

  const frac = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
      style={{ flex: 1, height: 32, justifyContent: "center" }}
    >
      <View
        pointerEvents="none"
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.18)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${frac * 100}%`,
            height: "100%",
            backgroundColor: colors.accent,
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: Math.max(0, Math.min(width - 14, frac * width - 7)),
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}
