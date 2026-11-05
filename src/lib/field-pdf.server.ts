import { PDFDocument, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontUrl from '@/assets/fonts/field-sans.ttf?url';
import { BOL_TERMS, DAMAGE_TERMS, DOCUMENT_TITLES, type FieldSnapshot } from '@/shared/field-documents';
import {FIELD_PHASES} from '@/shared/field';

export async function generateFieldPdf(snapshot: FieldSnapshot, origin: string) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontResponse = await fetch(new URL(fontUrl, origin));
  if (!fontResponse.ok) throw new Error('PDF font unavailable');
  const font = await pdf.embedFont(await fontResponse.arrayBuffer(), { subset: true });
  let page: PDFPage = pdf.addPage([612,792]);
  let y = 744;
  const newPage = () => { page = pdf.addPage([612,792]); y = 744; };
  const heading=(label:string,needed=100)=>{if(y<60+needed)newPage();y-=10;text(label,14);};
  const text = (value: unknown, size=11) => {
    const words = String(value ?? '').split(/\s+/); let line = '';
    for (const word of words) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`,size)>516) { if(y<60)newPage();page.drawText(line,{x:48,y,size,font});y-=size+6;line=''; }
      // Split unbroken labels/URLs instead of letting them overflow.
      for (const char of (line ? ' ' : '') + word) {
        if (font.widthOfTextAtSize(line+char,size)>516) { if(y<60)newPage();page.drawText(line,{x:48,y,size,font});y-=size+6;line=''; }
        line+=char;
      }
    }
    if(y<60)newPage(); page.drawText(line,{x:48,y,size,font});y-=size+8;
  };
  const image = async (data: string, maxHeight: number) => {
    if (!/^data:image\/(png|jpeg);base64,/.test(data)) throw new Error('Unsupported snapshot image');
    const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
    const img=data.startsWith('data:image/png')?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
    const scale=Math.min(516/img.width,maxHeight/img.height); const w=img.width*scale,h=img.height*scale;
    if(y-h<60)newPage();page.drawImage(img,{x:48,y:y-h,width:w,height:h});y-=h+18;
  };
  text(snapshot.company.name,20);text('BILL OF LADING — SIGNED MOVE-DAY SNAPSHOT',14);
  text(`Job #${snapshot.job['id']} · Signed ${snapshot.signedAt}`);
  text(`Customer: ${snapshot.job['customerName'] || snapshot.job['title']}`);
  text(`Move date: ${snapshot.job['moveDate']}`);
  text(`Pickup: ${snapshot.job['origin']}`);text(`Delivery: ${snapshot.job['destination']}`);
  text(`Office: ${snapshot.company.officeEmail || 'Not configured'} · ${snapshot.company.phone}`);
  heading('SERVICE TIMES AND CHARGES');
  const timeline=(snapshot.job['timeline'] ?? {}) as Record<string,unknown>;
  for(const phase of FIELD_PHASES)if(timeline[phase.key])text(`${phase.label}: ${timeline[phase.key]}`);
  const bill=(snapshot.job['bill'] ?? {}) as Record<string,unknown>;
  for(const [k,v] of Object.entries(bill))text(`${k}: ${k==='hours'?`${v} hours`:`$${Number(v).toFixed(2)}`}`);
  heading('SHIPMENT INVENTORY');
  const inventory=Array.isArray(snapshot.job['inventory'])?snapshot.job['inventory']:[];
  if(!inventory.length)text('No shipment inventory supplied.');
  for(const item of inventory)text(JSON.stringify(item));
  for(const [key,title] of Object.entries(DOCUMENT_TITLES)) {
    const doc=snapshot.documents[key as keyof typeof DOCUMENT_TITLES];
    heading(title.toUpperCase(),140);text(key==='damage'?DAMAGE_TERMS:key==='bol'?BOL_TERMS:'Furniture conditions recorded by the crew and acknowledged by the customer.');
    if(doc){text(doc.notes);for(const item of doc.items)text(`${item.item}: ${item.condition} — ${item.notes}`);if(doc.signature){text(`Signed ${doc.signedAt || snapshot.signedAt}`);await image(doc.signature,85);}}
    else text('No separate record captured.');
  }
  heading('CUSTOMER FINAL SIGNATURE',220);text(BOL_TERMS);await image(snapshot.signature,100);
  if(snapshot.photos.length){newPage();text('INSPECTION PHOTO APPENDIX',16);for(const photo of snapshot.photos){text(`${photo.phase==='pre'?'Before move':'After move'} · ${photo.note || 'Inspection photo'}`);await image(photo.photoUrl,280);}}
  pdf.setTitle(`Signed Bill of Lading — Job ${snapshot.job['id']}`);pdf.setAuthor(snapshot.company.name);
  for(const [i,p] of pdf.getPages().entries())p.drawText(`Job ${snapshot.job['id']} · Page ${i+1} of ${pdf.getPageCount()}`,{x:48,y:28,size:9,font});
  return pdf.save();
}