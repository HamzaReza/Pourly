/**
 * The app's `Text`: React Native's `Text` with the UI typeface applied. Every screen and component
 * imports `Text` from here (lint forbids the react-native one under app/ and src/ui), so the font
 * is set in one place: the style's `fontWeight` picks the matching DM Sans family while the UI
 * font is active, and the system font is kept otherwise (see `fonts.ts`).
 *
 * A `Text` nested in another inherits the parent's family unless it sets its own `fontWeight`
 * (or family), as React Native's own nested text does.
 */
import {
  Children,
  createContext,
  forwardRef,
  useContext,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { Text as NativeText, StyleSheet, type TextProps, type TextStyle } from 'react-native';

import { useUiFontActive, withUiFont } from './fonts';

export type { TextProps };

const InsideText = createContext(false);

/** Strings and numbers only: nothing nested can read the context, so none is provided. */
const plainChildren = (children: ReactNode): boolean =>
  Children.toArray(children).every(
    (child) => typeof child === 'string' || typeof child === 'number',
  );

export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(
  ({ style, children, ...props }, ref) => {
    const active = useUiFontActive();
    const nested = useContext(InsideText);
    let resolved = style;
    if (active) {
      const flat = StyleSheet.flatten(style) as TextStyle | undefined;
      const inherits = nested && flat?.fontWeight === undefined;
      resolved = inherits ? style : withUiFont(flat, true);
    }
    return (
      <NativeText ref={ref} {...props} style={resolved}>
        {nested || plainChildren(children) ? (
          children
        ) : (
          <InsideText.Provider value>{children}</InsideText.Provider>
        )}
      </NativeText>
    );
  },
);
Text.displayName = 'Text';
