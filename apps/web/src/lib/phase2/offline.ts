export type OfflineMark={clientKey:string;studentId:string;batchId:string;date:string;status:'present'|'absent'|'late'|'leave';queuedBy:string};
const STORE='tuition_attendance_queue_v2';
export function readQueue():OfflineMark[]{
 if(typeof window==='undefined')return [];
 try{const raw=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(raw)?raw.filter(isMark):[];}catch{return [];}
}
function isMark(m:any):m is OfflineMark{return !!m&&typeof m.clientKey==='string'&&typeof m.studentId==='string'&&typeof m.batchId==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(m.date)&&['present','absent','late','leave'].includes(m.status)&&typeof m.queuedBy==='string';}
export function queueMark(mark:OfflineMark){const marks=readQueue();marks.push(mark);localStorage.setItem(STORE,JSON.stringify(marks));return marks;}
export function removeMark(clientKey:string){const marks=readQueue().filter(m=>m.clientKey!==clientKey);localStorage.setItem(STORE,JSON.stringify(marks));return marks;}
// localStorage is an interim device queue. Do not treat it as encrypted or guaranteed durable.
