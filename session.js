import {read,attempts,seal,open,b64,unb64} from './vault.js?v=1.7.0';
const EPOCH='osh.session.epoch';
const epoch=()=>localStorage.getItem(EPOCH)||'0';
const fingerprint=meta=>JSON.stringify([meta?.id,meta?.salt,meta?.pinWrap?.body]);
async function database(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('osh-device-session',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('session');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
})}
async function access(mode,operation){const db=await database();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('session',mode),request=operation(tx.objectStore('session'));
 tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
})}finally{db.close()}}
// A nonextractable device wrapping key is structured-cloned into IndexedDB.
// Nothing here is exported to GitHub or an application backup; no PIN is stored.
export async function rememberSession(session){
 const generation=epoch(),identity=fingerprint(read());
 if(attempts()>=5||session.data.id!==read()?.id)throw Error('הכספת השתנתה. יש להיכנס מחדש');
 const deviceKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const wrapped=await seal(deviceKey,b64(session.raw));
 if(epoch()!==generation||fingerprint(read())!==identity)return;
 await access('readwrite',store=>{
  if(epoch()!==generation) return store.get('current');
  return store.put({deviceKey,wrapped,identity,generation},'current');
 });
}
export async function restoreSession(){
 const generation=epoch(),meta=read();if(!meta||attempts()>=5)return null;
 const saved=await access('readonly',store=>store.get('current'));
 if(!saved||saved.generation!==generation||saved.identity!==fingerprint(meta))return null;
 const raw=unb64(await open(saved.deviceKey,saved.wrapped));
 const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
 const data=await open(key,meta.payload);
 if(epoch()!==generation||fingerprint(read())!==saved.identity)return null;
 return {raw,key,meta,data,remembered:true};
}
export async function forgetSession(){
 localStorage.setItem(EPOCH,crypto.randomUUID());
 await access('readwrite',store=>store.delete('current'));
}
