/**
 * Generates a real Windows .ico with 32-bit BMP frames; Windows Explorer/NSIS
 * can use it at 16..256 px without Electron's generic fallback.
 * Only the build tool depends on sharp (open-source, no runtime download).
 * Keep build/icon-source.svg and build/icon-small.svg as the editable sources.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import sharp from 'sharp';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'build');
const sizes=[16,24,32,48,64,128,256];
const mainSvg=await readFile(join(out,'icon-source.svg'));
const smallSvg=await readFile(join(out,'icon-small.svg'));

function dibFrame(pixels,size){
  const xorBytes=size*size*4;
  const maskStride=Math.ceil(size/32)*4;
  const maskBytes=maskStride*size;
  const frame=Buffer.alloc(40+xorBytes+maskBytes);
  frame.writeUInt32LE(40,0);
  frame.writeInt32LE(size,4);
  frame.writeInt32LE(size*2,8); // XOR + AND mask heights
  frame.writeUInt16LE(1,12);
  frame.writeUInt16LE(32,14);
  frame.writeUInt32LE(0,16); // BI_RGB
  frame.writeUInt32LE(xorBytes+maskBytes,20);
  const maskStart=40+xorBytes;
  for(let y=0;y<size;y++){
    const sourceRow=size-1-y; // DIB pixel rows are bottom-up
    for(let x=0;x<size;x++){
      const src=(sourceRow*size+x)*4;
      const target=40+(y*size+x)*4;
      const alpha=pixels[src+3];
      frame[target]=pixels[src+2];     // B
      frame[target+1]=pixels[src+1];   // G
      frame[target+2]=pixels[src];     // R
      frame[target+3]=alpha;           // A
      if(alpha<128){
        frame[maskStart+y*maskStride+(x>>3)]|=0x80>>(x&7);
      }
    }
  }
  return frame;
}

async function render(source,size){
  const {data,info}=await sharp(source,{density:288})
    .resize(size,size,{fit:'fill'})
    .ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==size||info.height!==size||info.channels!==4)
    throw new Error('Dados RGBA inesperados: '+JSON.stringify(info));
  return dibFrame(data,size);
}

const frames=[];
for(const size of sizes)frames.push(await render(size<=24?smallSvg:mainSvg,size));
const header=Buffer.alloc(6+16*frames.length);
header.writeUInt16LE(1,2); // ICO type
header.writeUInt16LE(frames.length,4);
let position=header.length;
frames.forEach((frame,index)=>{
  const size=sizes[index],p=6+16*index;
  header[p]=size===256?0:size;
  header[p+1]=size===256?0:size;
  header.writeUInt16LE(1,p+4);
  header.writeUInt16LE(32,p+6);
  header.writeUInt32LE(frame.length,p+8);
  header.writeUInt32LE(position,p+12);
  position+=frame.length;
});
await mkdir(out,{recursive:true});
await writeFile(join(out,'icon.ico'),Buffer.concat([header,...frames]));
await writeFile(join(out,'icon.png'),await sharp(mainSvg,{density:288}).resize(512,512).png().toBuffer());
console.log('ArtiSys Windows icon: '+sizes.map(s=>s+'px').join(', '));
