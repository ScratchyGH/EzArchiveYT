export class Queue{
constructor(concurrency=2){
this.concurrency=concurrency;
this.running=0;
this.pending=[];
this.listeners={};
}
on(ev,fn){(this.listeners[ev]=this.listeners[ev]||[]).push(fn);return this;}
emit(ev,...args){(this.listeners[ev]||[]).forEach(fn=>fn(...args));}
add(task){
return new Promise((res,rej)=>{
this.pending.push({task,res,rej});
this._tick();
});
}
_tick(){
while(this.running<this.concurrency&&this.pending.length){
const {task,res,rej}=this.pending.shift();
this.running++;
this.emit('start',task.id);
Promise.resolve(task.run())
.then(r=>{this.running--;this.emit('done',task.id,r);res(r);this._tick();})
.catch(e=>{this.running--;this.emit('error',task.id,e);rej(e);this._tick();});
}
if(!this.running&&!this.pending.length)this.emit('idle');
}
get size(){return this.pending.length;}
get active(){return this.running;}
clear(){this.pending=[];}
}
