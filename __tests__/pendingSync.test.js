const {
  clearAllPending,
  clearDeletes,
  clearUpload,
  markDelete,
  markUpload,
  pendingDeletes,
  pendingUploads,
} = require('../src/shared/pendingSync');
const { storage } = require('../src/shared/storage');

// The queue is what stands between "scanned with no signal" and "that scan is
// gone from the backup forever", so these cover the states a flush can find
// rather than just the happy path.
beforeEach(() => {
  clearAllPending();
});

test('queues an id once, however many times it is marked', () => {
  markUpload('a');
  markUpload('a');
  markUpload('b');

  expect(pendingUploads()).toEqual(['a', 'b']);
});

test('clearing one id leaves the rest queued', () => {
  markUpload('a');
  markUpload('b');
  clearUpload('a');

  expect(pendingUploads()).toEqual(['b']);
});

test('clearing an id that was never queued is a no-op', () => {
  markUpload('a');
  clearUpload('nope');

  expect(pendingUploads()).toEqual(['a']);
});

// The invariant that keeps a deleted scan deleted. Without it, a scan removed
// before its upload ever landed stays in the upload queue, and the next flush
// recreates in the cloud exactly what the user just threw away.
test('deleting an id that is still waiting to upload cancels the upload', () => {
  markUpload('a');
  markUpload('b');

  markDelete('a');

  expect(pendingUploads()).toEqual(['b']);
  expect(pendingDeletes()).toEqual(['a']);
});

test('clearDeletes only drops the ids that actually went through', () => {
  markDelete('a');
  markDelete('b');
  markDelete('c');

  clearDeletes(['a', 'c']);

  expect(pendingDeletes()).toEqual(['b']);
});

test('survives a restart - the queue is read back from storage, not memory', () => {
  markUpload('a');
  markDelete('b');

  // What a fresh launch does: a new module instance reading the same MMKV
  // file. jest.isolateModules gives a real re-require, and the mock store
  // lives on `global` precisely so it outlives one.
  jest.isolateModules(() => {
    const fresh = require('../src/shared/pendingSync');
    expect(fresh.pendingUploads()).toEqual(['a']);
    expect(fresh.pendingDeletes()).toEqual(['b']);
  });
});

test('a corrupt queue degrades to empty instead of throwing on launch', () => {
  storage.set('tally.pending.upload.v1', '{not json');
  storage.set('tally.pending.delete.v1', '{"shape":"wrong"}');

  expect(pendingUploads()).toEqual([]);
  expect(pendingDeletes()).toEqual([]);
});

test('drops non-string entries rather than queueing them', () => {
  storage.set('tally.pending.upload.v1', JSON.stringify(['a', 42, null, 'b']));

  expect(pendingUploads()).toEqual(['a', 'b']);
});
