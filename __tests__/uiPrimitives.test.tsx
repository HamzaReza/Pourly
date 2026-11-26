import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { Button } from '@/ui/Button';
import { CountBadge } from '@/ui/CountBadge';
import { IconButton } from '@/ui/IconButton';
import { LinkRow, ListSection, ToggleRow } from '@/ui/List';
import { Overlay } from '@/ui/Overlay';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Switch } from '@/ui/Switch';
import { Tag } from '@/ui/Tag';
import { colors, controlHeights, MIN_TOUCH_TARGET, withAlpha } from '@/ui/tokens';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  const MockIcon = ({ name }: { name: string }) => (
    <MockText testID={`icon-${name}`}>{name}</MockText>
  );
  return { __esModule: true, default: MockIcon };
});

const ui = getTheme('classic').ui;

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children: (JsonNode | string)[] | null;
}

/** Every host node of the rendered tree (depth first) whose props match `predicate`. */
const findNodes = (predicate: (props: Record<string, unknown>) => boolean): JsonNode[] => {
  const out: JsonNode[] = [];
  const visit = (node: JsonNode | JsonNode[] | string | null): void => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (predicate(node.props)) out.push(node);
    (node.children ?? []).forEach(visit);
  };
  visit(screen.toJSON() as JsonNode | JsonNode[] | null);
  return out;
};

/** Total extra touch area a hitSlop adds above and below. */
const verticalSlop = (hitSlop: unknown): number => {
  if (typeof hitSlop === 'number') return hitSlop * 2;
  const slop = (hitSlop ?? {}) as { top?: number; bottom?: number };
  return (slop.top ?? 0) + (slop.bottom ?? 0);
};

beforeAll(async () => {
  await initI18n('en');
});

describe('withAlpha', () => {
  it('appends an alpha byte to #RRGGBB and leaves other formats alone', () => {
    expect(withAlpha('#2EC4FF', 0.2)).toBe('#2EC4FF33');
    expect(withAlpha('#2EC4FF', 1)).toBe('#2EC4FFFF');
    expect(withAlpha('#2EC4FF', -1)).toBe('#2EC4FF00');
    expect(withAlpha('rgba(0,0,0,0.5)', 0.2)).toBe('rgba(0,0,0,0.5)');
  });
});

describe('Switch and ToggleRow', () => {
  it('draws the thumb at the end with an accent track when on', async () => {
    await render(<Switch ui={ui} value />);
    const track = screen.root;
    expect(flat(track?.props.style)).toMatchObject({
      backgroundColor: ui.accent,
      alignItems: 'flex-end',
    });
  });

  it('draws the thumb at the start when off', async () => {
    await render(<Switch ui={ui} value={false} />);
    expect(flat(screen.root?.props.style)).toMatchObject({ alignItems: 'flex-start' });
  });

  it('is a whole-row switch with the checked state and toggles on press', async () => {
    const onChange = jest.fn();
    await render(<ToggleRow ui={ui} icon="volume-high" label="Sound" value onChange={onChange} />);
    const row = screen.getByRole('switch', { name: 'Sound' });
    expect(row).toBeChecked();
    await fireEvent.press(row);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('SegmentedControl', () => {
  it('is a radio group whose selected option is checked and presses select options', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        ui={ui}
        label="Quality"
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'high', label: 'High' },
          { value: 'low', label: 'Low' },
        ]}
        value="high"
        onChange={onChange}
        optionA11y={(option) => `Quality: ${option}`}
      />,
    );
    expect(screen.getByLabelText('Quality').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Quality: High' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Quality: Auto' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Quality: Low' }));
    expect(onChange).toHaveBeenCalledWith('low');
  });
});

describe('ListSection', () => {
  const separators = () =>
    findNodes((props) => flat(props.style).height === StyleSheet.hairlineWidth);

  it('puts one hairline between each pair of rows and ignores null children', async () => {
    await render(
      <ListSection ui={ui} title="About">
        <LinkRow ui={ui} icon="mail" label="One" onPress={jest.fn()} />
        {null}
        <LinkRow ui={ui} icon="mail" label="Two" onPress={jest.fn()} />
        {false}
        <LinkRow ui={ui} icon="mail" label="Three" onPress={jest.fn()} />
      </ListSection>,
    );
    expect(screen.getByRole('header', { name: 'About' })).toBeTruthy();
    expect(separators()).toHaveLength(2);
  });

  it('has no separator for a single row and shows the footer', async () => {
    await render(
      <ListSection ui={ui} title="Account" footer="A note">
        <LinkRow ui={ui} icon="mail" label="Only" onPress={jest.fn()} />
      </ListSection>,
    );
    expect(separators()).toHaveLength(0);
    expect(screen.getByText('A note')).toBeTruthy();
  });

  it('tints the icon of a danger row with the danger color', async () => {
    await render(
      <LinkRow ui={ui} icon="trash-outline" label="Delete" tone="danger" onPress={jest.fn()} />,
    );
    const tile = screen.getByTestId('icon-trash-outline').parent;
    expect(flat(tile?.props.style).backgroundColor).toBe(withAlpha(colors.danger, 0.16));
  });
});

describe('Button', () => {
  it('sm is a compact pill that still has a 44 dp touch target', async () => {
    await render(<Button size="sm" label="Buy" onPress={jest.fn()} ui={ui} />);
    const button = screen.getByRole('button', { name: 'Buy' });
    expect(flat(button.props.style).minHeight).toBe(controlHeights.sm);
    expect(controlHeights.sm + verticalSlop(button.props.hitSlop)).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET,
    );
  });

  it('lg is 48 dp with no hitSlop', async () => {
    await render(<Button label="Play" onPress={jest.fn()} ui={ui} />);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(flat(button.props.style).minHeight).toBe(controlHeights.lg);
    expect(button.props.hitSlop).toBeUndefined();
  });

  it('ghost is text only with an accent label', async () => {
    await render(<Button variant="ghost" label="Cancel" onPress={jest.fn()} ui={ui} />);
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(flat(button.props.style).backgroundColor).toBe('transparent');
    expect(flat(screen.getByText('Cancel').props.style).color).toBe(ui.accent);
  });

  it('primary fills with the accent and secondary uses a tonal wash', async () => {
    await render(
      <>
        <Button variant="primary" label="Go" onPress={jest.fn()} ui={ui} />
        <Button label="Other" onPress={jest.fn()} ui={ui} />
      </>,
    );
    expect(flat(screen.getByRole('button', { name: 'Go' }).props.style).backgroundColor).toBe(
      ui.accent,
    );
    const secondary = flat(screen.getByRole('button', { name: 'Other' }).props.style);
    expect(secondary.backgroundColor).toMatch(/^#[0-9A-F]{8}$/i);
    expect(secondary.borderWidth).toBeUndefined();
  });
});

describe('Overlay icon', () => {
  it('hides the decorative icon from screen readers and keeps the title as the header', async () => {
    await render(
      <Overlay title="Use 1 +Tube?" message="It stays." icon="add-circle-outline">
        <Text>body</Text>
      </Overlay>,
    );
    const icon = screen.getByTestId('icon-add-circle-outline', { includeHiddenElements: true });
    expect(icon.parent?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(icon.parent?.props.accessible).toBe(false);
    expect(screen.getByRole('header', { name: 'Use 1 +Tube?' })).toBeTruthy();
  });

  it('a gold icon badge uses the lighter gold tint (no olive circle)', async () => {
    await render(<Overlay title="Not enough coins" icon="wallet-outline" iconTone="gold" />);
    const badge = screen.getByTestId('icon-wallet-outline', { includeHiddenElements: true }).parent;
    expect(flat(badge?.props.style).backgroundColor).toBe(withAlpha(colors.coin, 0.08));
  });

  it('balances the message lines', async () => {
    await render(<Overlay title="T" message="A message" />);
    expect(screen.getByText('A message').props.textBreakStrategy).toBe('balanced');
  });

  it('renders no icon when none is given', async () => {
    await render(<Overlay title="Paused" />);
    expect(screen.queryByTestId(/^icon-/, { includeHiddenElements: true })).toBeNull();
  });
});

describe('IconButton', () => {
  it('filled draws a 40 dp surface circle and keeps a 44 dp touch target', async () => {
    await render(
      <IconButton
        icon="pause"
        accessibilityLabel="Pause"
        onPress={jest.fn()}
        tone="filled"
        ui={ui}
      />,
    );
    const button = screen.getByRole('button', { name: 'Pause' });
    const style = flat(button.props.style);
    expect(style).toMatchObject({ width: 40, height: 40, backgroundColor: ui.surface });
    expect(40 + verticalSlop(button.props.hitSlop)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('plain is a 44 dp glyph button', async () => {
    await render(<IconButton icon="close" accessibilityLabel="Close" onPress={jest.fn()} />);
    expect(flat(screen.getByRole('button', { name: 'Close' }).props.style)).toMatchObject({
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
    });
  });
});

describe('CountBadge', () => {
  const badgeStyle = () =>
    flat(findNodes((props) => flat(props.style).position === 'absolute')[0]?.props.style);

  it('uses the accent for counts', async () => {
    await render(<CountBadge ui={ui} count={3} />);
    expect(badgeStyle().backgroundColor).toBe(ui.accent);
    expect(flat(screen.getByText('3', { includeHiddenElements: true }).props.style).color).toBe(
      ui.onAccent,
    );
  });

  it('uses a neutral pill with the text color for coin prices', async () => {
    await render(<CountBadge ui={ui} count={40} coin />);
    expect(badgeStyle().backgroundColor).toBe(ui.surface);
    expect(flat(screen.getByText('40', { includeHiddenElements: true }).props.style).color).toBe(
      ui.text,
    );
  });

  it('shows an icon instead of a number for ads', async () => {
    await render(<CountBadge ui={ui} icon="play" />);
    expect(badgeStyle().backgroundColor).toBe(ui.accent);
    expect(screen.getByTestId('icon-play', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('Tag', () => {
  it('is read as plain text unless it has its own label', async () => {
    await render(
      <>
        <Tag ui={ui} label="Popular" />
        <Tag ui={ui} label="Active" accessibilityLabel="Your VIP is active" testID="active" />
      </>,
    );
    expect(screen.getByText('Popular')).toBeTruthy();
    expect(screen.getByLabelText('Your VIP is active')).toBeTruthy();
  });

  it('gold tone uses the coin color', async () => {
    await render(<Tag ui={ui} label="Best value" tone="gold" testID="tag" />);
    expect(flat(screen.getByTestId('tag').props.style).backgroundColor).toBe(colors.coin);
  });
});
