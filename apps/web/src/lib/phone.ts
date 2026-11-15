export function mobileDisplay(value:string|null|undefined){const text=String(value||'');return text.replace(/^\+91(?=\d{10}$)/,'');}
