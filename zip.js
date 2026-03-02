
// zip.js - minimal "store" ZIP writer (no compression), for small support bundles.
// Supports: addText(name, text) and generateBlob().

function crc32(buf){
  let crc = ~0;
  for (let i=0; i<buf.length; i++){
    crc ^= buf[i];
    for (let k=0; k<8; k++){
      crc = (crc >>> 1) ^ (0xEDB88320 & (-(crc & 1)));
    }
  }
  return (~crc) >>> 0;
}

function u16(n){ return new Uint8Array([n & 255, (n>>>8)&255]); }
function u32(n){ return new Uint8Array([n & 255, (n>>>8)&255, (n>>>16)&255, (n>>>24)&255]); }

export class SimpleZip {
  constructor(){
    this.files = [];
  }

  addText(name, text){
    const enc = new TextEncoder();
    const data = enc.encode(text || "");
    this.files.push({ name, data });
  }

  generateBlob(){
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of this.files){
      const nameBytes = new TextEncoder().encode(f.name);
      const data = f.data;
      const c = crc32(data);

      // Local file header
      const local = [
        u32(0x04034b50),
        u16(20), u16(0), u16(0),       // version, flags, method=store
        u16(0), u16(0),                // time/date
        u32(c),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
        data
      ];
      for (const p of local) parts.push(p);
      const localSize = local.reduce((s,p)=>s + p.length, 0);

      // Central directory header
      const cen = [
        u32(0x02014b50),
        u16(20), u16(20), u16(0), u16(0),
        u16(0), u16(0),
        u32(c),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0), u16(0),
        u16(0), u16(0),
        u32(0),
        u32(offset),
        nameBytes
      ];
      central.push(...cen);

      offset += localSize;
    }

    // end of central directory
    const centralSize = central.reduce((s,p)=>s + p.length, 0);
    const eocd = [
      u32(0x06054b50),
      u16(0), u16(0),
      u16(this.files.length),
      u16(this.files.length),
      u32(centralSize),
      u32(offset),
      u16(0)
    ];

    for (const p of central) parts.push(p);
    for (const p of eocd) parts.push(p);

    return new Blob(parts, { type: "application/zip" });
  }
}
