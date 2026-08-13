"""Đọc thông số một file .tflite mà không cần cài tensorflow.

    python3 tools/inspect_tflite.py assets/models/<model>.tflite

In shape/kiểu/lượng tử hoá của tensor vào-ra, và đếm buffer kiểu offset - xem
assets/models/README.md, đó là loại file runtime không chạy được.
"""
import struct
import sys

TYPES = {
    0: 'float32', 1: 'float16', 2: 'int32', 3: 'uint8', 4: 'int64',
    5: 'string', 6: 'bool', 7: 'int16', 8: 'complex64', 9: 'int8',
    10: 'float64', 11: 'complex128', 12: 'uint64', 13: 'resource',
    14: 'variant', 15: 'uint32', 16: 'uint16', 17: 'int4',
}


class Buf:
    def __init__(self, data):
        self.d = data

    def u32(self, p):
        return struct.unpack_from('<I', self.d, p)[0]

    def i32(self, p):
        return struct.unpack_from('<i', self.d, p)[0]

    def u16(self, p):
        return struct.unpack_from('<H', self.d, p)[0]

    def i8(self, p):
        return struct.unpack_from('<b', self.d, p)[0]

    def f32(self, p):
        return struct.unpack_from('<f', self.d, p)[0]

    def i64(self, p):
        return struct.unpack_from('<q', self.d, p)[0]

    def field(self, table, idx):
        """Vị trí tuyệt đối của field idx trong table, None nếu không có."""
        vt = table - self.i32(table)
        vt_size = self.u16(vt)
        off_pos = vt + 4 + idx * 2
        if off_pos >= vt + vt_size:
            return None
        off = self.u16(off_pos)
        return None if off == 0 else table + off

    def indirect(self, p):
        return None if p is None else p + self.u32(p)

    def vec(self, p):
        """(vị trí phần tử đầu, số phần tử)."""
        if p is None:
            return None, 0
        v = p + self.u32(p)
        return v + 4, self.u32(v)

    def string(self, p):
        s, n = self.vec(p)
        return None if s is None else self.d[s:s + n].decode('utf-8', 'replace')


def read_tensor(b, t):
    shape_p, shape_n = b.vec(b.field(t, 0))
    shape = [b.i32(shape_p + 4 * i) for i in range(shape_n)] if shape_p else []

    type_p = b.field(t, 1)
    dtype = TYPES.get(b.i8(type_p) if type_p else 0, '?')

    name = b.string(b.field(t, 3)) or ''

    scale = zero = None
    q = b.indirect(b.field(t, 4))
    if q is not None:
        sp, sn = b.vec(b.field(q, 2))
        if sp and sn:
            scale = b.f32(sp)
        zp, zn = b.vec(b.field(q, 3))
        if zp and zn:
            zero = b.i64(zp)

    return {'name': name, 'shape': shape, 'dtype': dtype,
            'scale': scale, 'zero_point': zero}


def main(path):
    b = Buf(open(path, 'rb').read())
    model = b.u32(0)

    sg_p, sg_n = b.vec(b.field(model, 2))
    print(f'subgraphs: {sg_n}')
    sub = sg_p + b.u32(sg_p)  # subgraph đầu tiên

    tp, tn = b.vec(b.field(sub, 0))
    tensors = [read_tensor(b, tp + 4 * i + b.u32(tp + 4 * i)) for i in range(tn)]

    # Buffer kieu offset: data rong, du lieu nam ngoai flatbuffer.
    buf_p, buf_n = b.vec(b.field(model, 4))
    external = 0
    for i in range(buf_n):
        t = buf_p + 4 * i + b.u32(buf_p + 4 * i)
        has_data = b.field(t, 0) is not None and b.vec(b.field(t, 0))[1] > 0
        if not has_data and (b.field(t, 1) or b.field(t, 2)):
            external += 1
    verdict = 'CHAY DUOC' if external == 0 else 'KHONG CHAY DUOC tren litert 1.4.0'
    print(f'buffers: {buf_n} (offset ngoai: {external}) -> {verdict}')

    for label, fidx in (('INPUT', 1), ('OUTPUT', 2)):
        ip, n = b.vec(b.field(sub, fidx))
        print(f'\n=== {label} ({n}) ===')
        for i in range(n):
            t = tensors[b.i32(ip + 4 * i)]
            q = ''
            if t['scale'] is not None:
                q = f"  scale={t['scale']:.8g} zero_point={t['zero_point']}"
            print(f"  {t['name']}: {t['shape']} {t['dtype']}{q}")


main(sys.argv[1])
