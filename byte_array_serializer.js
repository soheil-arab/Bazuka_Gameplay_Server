const buf = Buffer.allocUnsafe(4);
buf.writeInt32LE(1, 0);
console.log(buf);
const buf2 = Buffer.allocUnsafe(4);
buf.copy(buf2, 0, 0, 4);
console.log(buf2);
var a = 123;
a = buf2.readInt32LE(0);
console.log(a);