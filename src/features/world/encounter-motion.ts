/** Visual progress only: backend facts and outcomes remain in the companion controller. */
export class EncounterMotion {
  progress = 0;
  returning = false;
  private meetingTime = 0;
  update(dt: number, outcome: string | null, reduced: boolean) {
    dt=Math.max(0,Math.min(.1,dt));
    if (outcome === 'cancelled' || outcome === 'error') this.returning=true;
    if (!this.returning) {
      this.progress=reduced ? 1 : Math.min(1,this.progress+dt/1.6);
      if (this.progress === 1) this.meetingTime+=dt;
      if (outcome && this.meetingTime > (reduced ? 0 : .25)) this.returning=true;
    } else this.progress=reduced ? 0 : Math.max(0,this.progress-dt/1.1);
    return this.returning && this.progress===0;
  }
  get mix() { const t=this.progress; return t*t*(3-2*t); }
  get arc() { return Math.sin(this.progress*Math.PI)*.8; }
}
