const React = require('react');
const TestRenderer = require('react-test-renderer');
const { Pressable, Text } = require('react-native');

const { useDialog } = require('../src/components/Dialog');
const { t } = require('../src/i18n');

// The first component test in this project. It exists as much to keep the
// Reanimated Jest setup honest - see the resolver note in jest.config.js -
// as to cover Dialog itself: every component here imports Reanimated, so a
// regression in that config silently costs the whole UI its testability.

function Harness({ config }) {
  const { show, dialog } = useDialog();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(Pressable, { testID: 'open', onPress: () => show(config) }),
    dialog,
  );
}

function render(config) {
  let tree;
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(Harness, { config }));
  });
  return tree;
}

function open(tree) {
  TestRenderer.act(() => {
    tree.root.findByProps({ testID: 'open' }).props.onPress();
  });
}

/** Every string the dialog actually rendered, in order. */
function texts(tree) {
  return tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .filter(v => typeof v === 'string');
}

/**
 * The action button carrying `label`.
 *
 * Found by walking up from the label's own Text rather than by
 * findAllByType(Pressable): Pressable renders through an internal host type,
 * so searching for the exported component finds nothing.
 */
function button(tree, label) {
  let node = tree.root.findAll(
    n => n.type === Text && n.props.children === label,
  )[0];

  while (node != null) {
    if (typeof node.props?.onPress === 'function') return node;
    node = node.parent;
  }
  throw new Error(`no pressable found for "${label}"`);
}

test('shows nothing until asked', () => {
  const tree = render({ title: 'Xoá?' });
  expect(texts(tree)).toEqual([]);
});

test('renders the title and message it was shown with', () => {
  const tree = render({ title: 'Xoá?', message: 'Không thể hoàn tác.' });
  open(tree);

  expect(texts(tree)).toContain('Xoá?');
  expect(texts(tree)).toContain('Không thể hoàn tác.');
});

test('a notice with no actions gets a single dismiss button', () => {
  const tree = render({ title: 'Không quét được ảnh' });
  open(tree);

  expect(texts(tree)).toEqual(['Không quét được ảnh', t('close')]);
});

test('runs the pressed action and closes', () => {
  const onPress = jest.fn();
  const tree = render({
    title: 'Xoá?',
    actions: [
      { label: 'Xoá', variant: 'destructive', onPress },
      { label: 'Huỷ', variant: 'cancel' },
    ],
  });
  open(tree);

  TestRenderer.act(() => {
    button(tree, 'Xoá').props.onPress();
  });

  expect(onPress).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toEqual([]);
});

test('cancel closes without running the other action', () => {
  const onPress = jest.fn();
  const tree = render({
    title: 'Xoá?',
    actions: [
      { label: 'Xoá', variant: 'destructive', onPress },
      { label: 'Huỷ', variant: 'cancel' },
    ],
  });
  open(tree);

  TestRenderer.act(() => {
    button(tree, 'Huỷ').props.onPress();
  });

  expect(onPress).not.toHaveBeenCalled();
  expect(texts(tree)).toEqual([]);
});
