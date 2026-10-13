export class Sound {
  enabled=false;context=null;
  toggle(){this.enabled=!this.enabled;if(this.enabled){this.context??=new AudioContext();this.context.resume();this.play('build');}return this.enabled;}
  play(kind){if(!this.enabled||!this.context)return;const c=this.context,notes=kind==='win'?[523,659,784,1046]:kind==='pulse'?[220,440,880]:kind==='build'?[440,659]:[330];notes.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain(),at=c.currentTime+i*.085;o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.055,at+.02);g.gain.exponentialRampToValueAtTime(.001,at+.3);o.connect(g);g.connect(c.destination);o.start(at);o.stop(at+.31);});}
}
