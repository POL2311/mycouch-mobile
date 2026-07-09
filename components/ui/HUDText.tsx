import { Text, type TextProps } from "react-native";

type Size = "label" | "caption" | "body" | "data";

const SIZE_STYLES: Record<Size, { fontSize: number; letterSpacing: number }> = {
  label:   { fontSize: 8,  letterSpacing: 3   },
  caption: { fontSize: 9,  letterSpacing: 2   },
  body:    { fontSize: 11, letterSpacing: 1   },
  data:    { fontSize: 14, letterSpacing: 0.5 },
};

interface HUDTextProps extends TextProps {
  size?: Size;
}

export function HUDText({ size = "label", style, ...props }: HUDTextProps) {
  const s = SIZE_STYLES[size];
  return (
    <Text
      style={[
        {
          fontFamily:    "Courier New",
          fontSize:      s.fontSize,
          letterSpacing: s.letterSpacing,
          textTransform: "uppercase",
          color:         "#52525b",
        },
        style,
      ]}
      {...props}
    />
  );
}
