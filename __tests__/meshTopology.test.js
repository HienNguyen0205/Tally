const {
  MESH_TRIANGLES,
  MESH_EDGES,
  meshSegments,
} = require('../src/detection/meshTopology');
const { MESH_POINTS } = require('../src/detection/meshLandmarks');

describe('face mesh topology', () => {
  it('is whole triangles over the 468 landmarks', () => {
    expect(MESH_TRIANGLES.length % 3).toBe(0);
    expect(MESH_TRIANGLES.length / 3).toBe(880);
    for (const i of MESH_TRIANGLES) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(MESH_POINTS);
    }
  });

  it('never repeats an edge, in either direction', () => {
    // Interior edges belong to two triangles each. Emitting both would stroke
    // most of the face twice - invisible in a screenshot, but double the work
    // and a mesh that darkens along every shared edge.
    const seen = new Set();
    for (let e = 0; e < MESH_EDGES.length; e += 2) {
      const a = MESH_EDGES[e];
      const b = MESH_EDGES[e + 1];
      expect(a).not.toBe(b);
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(MESH_EDGES.length / 2);
  });

  it('keeps every edge of every triangle', () => {
    const have = new Set();
    for (let e = 0; e < MESH_EDGES.length; e += 2) {
      have.add(`${MESH_EDGES[e]}-${MESH_EDGES[e + 1]}`);
    }

    for (let t = 0; t < MESH_TRIANGLES.length; t += 3) {
      const [a, b, c] = [
        MESH_TRIANGLES[t],
        MESH_TRIANGLES[t + 1],
        MESH_TRIANGLES[t + 2],
      ];
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        expect(have.has(`${Math.min(p, q)}-${Math.max(p, q)}`)).toBe(true);
      }
    }
  });

  it('touches every landmark - a point left out is a hole in the mesh', () => {
    const used = new Set(MESH_TRIANGLES);
    expect(used.size).toBe(MESH_POINTS);
  });
});

describe('meshSegments', () => {
  /** Landmarks where point i sits at (i/1000, i/2000) - distinct per point, so
   *  a segment that picked up the wrong index is visible in the numbers. */
  const mesh = new Float32Array(MESH_POINTS * 2);
  for (let i = 0; i < MESH_POINTS; i++) {
    mesh[i * 2] = i / 1000;
    mesh[i * 2 + 1] = i / 2000;
  }

  it('emits two endpoints per edge, in edge order', () => {
    const out = meshSegments(mesh, 1, 1, 0, 0);
    expect(out).toHaveLength(MESH_EDGES.length);

    const a = MESH_EDGES[0];
    const b = MESH_EDGES[1];
    // toBeCloseTo, not toEqual: the landmarks are a Float32Array, so 0.034
    // comes back as 0.03400000184774399.
    expect(out[0].x).toBeCloseTo(a / 1000);
    expect(out[0].y).toBeCloseTo(a / 2000);
    expect(out[1].x).toBeCloseTo(b / 1000);
    expect(out[1].y).toBeCloseTo(b / 2000);
  });

  it('applies scale and offset per axis', () => {
    // The two callers pass wildly different maps - the camera overlay stretches
    // the whole frame, the scan preview blows one crop up - and a map applied
    // to x but not y would float the mesh off the face in one direction only,
    // which reads as a broken model rather than as arithmetic.
    const out = meshSegments(mesh, 10, 100, 3, -7);
    const a = MESH_EDGES[0];
    expect(out[0].x).toBeCloseTo((a / 1000) * 10 + 3);
    expect(out[0].y).toBeCloseTo((a / 2000) * 100 - 7);
  });

  it('appends to the list it is given, so several faces share one array', () => {
    const first = meshSegments(mesh, 1, 1, 0, 0);
    const both = meshSegments(mesh, 1, 1, 0, 0, first);
    expect(both).toBe(first);
    expect(both).toHaveLength(MESH_EDGES.length * 2);
  });
});
