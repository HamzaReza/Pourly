import { memo, type ReactNode } from 'react';

import type { IconName } from './IconButton';
import { Overlay } from './Overlay';

export interface SheetProps {
  title: string;
  message?: string;
  children?: ReactNode;
  /** Backdrop tap closes the sheet when provided. */
  onClose?: () => void;
  icon?: IconName;
  testID?: string;
}

/** A bottom sheet: the overlay card anchored to the bottom edge, sliding up. */
const SheetComponent = ({ title, message, children, onClose, icon, testID }: SheetProps) => (
  <Overlay
    title={title}
    message={message}
    onBackdropPress={onClose}
    placement="bottom"
    icon={icon}
    testID={testID}
  >
    {children}
  </Overlay>
);

export const Sheet = memo(SheetComponent);
