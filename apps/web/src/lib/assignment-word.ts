import { inflateRawSync } from 'node:zlib';
// Validate actual expanded sizes too: ZIP directory size claims alone cannot
// bound an untrusted DOCX parser's memory use.
export function validateWordExpansion(buffer:Buffer){
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Invalid Word archive.');
  let offset=buffer.readUInt32LE(end+16),total=0;
  const count=buffer.readUInt16LE(end+10);
  if(count>2000)throw new Error('Word archive is too complex.');
  for(let i=0;i<count;i++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid Word directory.');
    const method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),size=buffer.readUInt32LE(offset+24),local=buffer.readUInt32LE(offset+42);
    total+=size;if(total>32*1024*1024||size===0xffffffff)throw new Error('Expanded Word content is too large.');
    if(local+30>buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid Word entry.');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    if(start+compressed>buffer.length)throw new Error('Invalid Word entry size.');
    try{
      if(method===0){if(compressed!==size)throw new Error('size');}
      else if(method===8){if(inflateRawSync(buffer.subarray(start,start+compressed),{maxOutputLength:Math.max(1,size+1)}).length!==size)throw new Error('size');}
      else throw new Error('compression');
    }catch{throw new Error('Word archive contains invalid or oversized compressed data.');}
    offset+=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  }
}
