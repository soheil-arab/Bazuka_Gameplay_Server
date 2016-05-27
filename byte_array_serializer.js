const buf = Buffer.alloc(64);
buf.write('123', 0, 30);
console.log(buf.toString('utf8'));
// prints: 68656c6c6f20776f726c64
