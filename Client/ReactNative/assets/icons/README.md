# Interface icons

These vector paths follow the short drama icon shapes and states of the original reference app.

Use `components/ui/SvgIcon` for static icons. Its `color` prop takes precedence
over an existing `tintColor` style; dimensions, margins, and opacity are preserved.
The animated episode equalizer uses `PlayingIcon`. Photos, artwork, Lottie
animations, and native system route pickers keep their original rendering.

SVG files are transformed with the Expo entry point of
`react-native-svg-transformer` and rendered by the existing `react-native-svg`
dependency. Restart Metro after changing the transformer configuration.
