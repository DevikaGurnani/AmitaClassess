'use client';
export type AppNotification={id:string;title:string;detail?:string;kind:'success'|'error'|'info';time:number;view?:string;persisted?:boolean;read?:boolean};
export function notify(title:string,kind:AppNotification['kind']='success',detail?:string){
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('tuition-notification',{detail:{id:crypto.randomUUID(),title,detail,kind,time:Date.now()}}));
}
