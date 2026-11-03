import { ROT, SLOTS } from './lattice.js';

const m3 = m => `mat3(${m[0]},${m[3]},${m[6]},${m[1]},${m[4]},${m[7]},${m[2]},${m[5]},${m[8]})`;

export const VS = `#version 300 es
out vec2 vUv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;

// Slots with a fixed use, ahead of the slots the graph allocates.
export const FIXED = { detail: 0, detailOct: 30, cloud: 30, cloudOct: 12, wave: 42, waveOct: 34, warp: 76, graph: 80 };

const HEAD = `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
layout(std140) uniform Lat{vec4 LF[${SLOTS}];ivec4 LI[${SLOTS}];};
uniform vec4 uP[96];
uniform vec3 uU,uRight,uUp,uFwd,uSun,uSunCol;
uniform float uA,uR,uHMin,uHMax,uSea,uTan,uAspect,uPix,uTime;
uniform vec2 uRes,uJit;uniform int uFrame,uSteps,uShadow,uCloudSteps,uSeaType,uFine,uStyle;
uniform sampler2D uTrans,uPal,uRing;
uniform vec3 uBetaR,uBetaM;uniform float uHr,uHm,uAtmTop,uMieG,uAtmOn;
uniform float uCover,uCloudLo,uCloudHi,uCloudDen;uniform vec3 uCloudCol;uniform mat3 uCloudRot;
uniform float uTemp,uMoist,uLava;uniform vec3 uSeaCol;
uniform vec4 uMoon[3],uMoonCol[3];uniform int uMoons;
uniform vec4 uRingA;uniform vec3 uRingN,uRingCol;
uniform float uStars,uNebula,uHue;
uniform vec4 uBomb[4];uniform int uBombs;
uniform sampler2D uMap;uniform vec3 uMapE,uMapT1,uMapT2,uMapC;uniform vec2 uMapL;uniform float uMapTexel;
const mat3 ROT[4]=mat3[4](${ROT.map(m3).join(',')});
in vec2 vUv;
`;

const NOISE = `
uvec3 pcg(uvec3 v){v=v*1664525u+1013904223u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;v^=v>>16u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;return v;}
vec3 gradAt(ivec3 c){uvec3 u=uvec3(c);uint h=(u.x*1597334677u)^(u.y*3812015801u)^(u.z*2798796415u);h^=h>>15u;h*=745463917u;h^=h>>13u;h*=2654435761u;h^=h>>16u;
  vec3 g=vec3(float(h&1023u),float((h>>10u)&1023u),float((h>>20u)&1023u))/511.5-1.;return g*inversesqrt(dot(g,g)+1e-4);}
vec3 rand3(ivec3 c){return vec3(pcg(uvec3(c))>>16u)/65535.;}
// Simplex noise with gradient, in the exact lattice. wv displaces the octave for domain warping.
vec4 sn(int s,int k,vec3 d){
  vec4 fw=LF[s+k];mat3 R=ROT[k&3];
  vec3 p=R*d*fw.w;
  vec3 xs=fw.xyz+p+dot(p,vec3(1./3.));
  vec3 fl=floor(xs);ivec3 c=LI[s+k].xyz+ivec3(fl);
  vec3 f=xs-fl;
  vec3 x0=f-dot(f,vec3(1./6.));
  vec3 e=step(x0.yzx,x0.xyz);
  vec3 i1=e*(1.-e.zxy),i2=1.-e.zxy*(1.-e);
  vec3 x1=x0-i1+1./6.,x2=x0-i2+1./3.,x3=x0-.5;
  vec3 g0=gradAt(c),g1=gradAt(c+ivec3(i1)),g2=gradAt(c+ivec3(i2)),g3=gradAt(c+1);
  vec4 t=max(.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  vec4 t2=t*t,t4=t2*t2;
  vec4 gx=vec4(dot(g0,x0),dot(g1,x1),dot(g2,x2),dot(g3,x3));
  float v=dot(t4,gx);
  vec4 t3g=-8.*t2*t*gx;
  vec3 dv=t3g.x*x0+t3g.y*x1+t3g.z*x2+t3g.w*x3+t4.x*g0+t4.y*g1+t4.z*g2+t4.w*g3;
  return vec4((dv*72.*fw.w)*R,v*72.);
}
float snv(int s,int k,vec3 d){return sn(s,k,d).w;}
vec4 dmul(vec4 a,vec4 b){return vec4(a.xyz*b.w+b.xyz*a.w,a.w*b.w);}
vec4 dblend(vec4 a,vec4 b,vec4 t){float k=clamp(t.w,0.,1.);return vec4(mix(a.xyz,b.xyz,k)+(b.w-a.w)*(t.w>0.&&t.w<1.?t.xyz:vec3(0.)),mix(a.w,b.w,k));}
vec4 dsmooth(vec4 a,float lo,float hi){float t=(a.w-lo)/(hi-lo);if(t<=0.)return vec4(0.);if(t>=1.)return vec4(0.,0.,0.,1.);return vec4(a.xyz*(6.*t*(1.-t)/(hi-lo)),t*t*(3.-2.*t));}
vec4 dpow(vec4 a,float e){float v=max(a.w,1e-4);float p=pow(v,e);return vec4(a.xyz*(e*p/v),p);}
vec4 dterrace(vec4 a,float n,float k){float x=a.w*n,fl=floor(x),f=x-fl;float g=pow(f,mix(1.,10.,k));float dg=mix(1.,10.,k)*pow(max(f,1e-3),mix(1.,10.,k)-1.);return vec4(a.xyz*dg,(fl+g)/n);}
float bombMask1(vec3 d){return 0.;}
vec4 bombMask(vec3 d){
  vec4 r=vec4(0.);
  for(int i=0;i<uBombs;i++){vec3 q=d+uU-uBomb[i].xyz;float l=length(q),rad=uBomb[i].w;float t=clamp((rad-l)/(rad*.5),0.,1.);
    if(t>0.&&t<1.){float s=6.*t*(1.-t);r.xyz+=-(q/max(l,1e-6))*s/(rad*.5);}
    r.w+=t*t*(3.-2.*t);}
  r.w=min(r.w,1.);return r;
}
vec4 fractal(int pi,vec3 d,float lod){
  vec4 a=uP[pi],b=uP[pi+1],c=uP[pi+2];
  int s=int(a.x),maxO=int(a.y),type=int(a.z);float ga=a.w;
  float off=b.x,gn=b.y,ero=b.z,warp=b.w;
  float oc=clamp((lod-c.x)*c.y,1.,float(maxO));
  int n=int(ceil(oc));float last=oc-float(n)+1.;
  // domain warp, exact gradient via its Jacobian; only low octaves use it (keeps float range small)
  vec3 w=vec3(0.);mat3 J=mat3(0.);
  if(warp>0.){int ws=int(c.z);
    vec4 w0=sn(ws,0,d),w1=sn(ws+2,0,d),w2=sn(ws+4,0,d);
    w=vec3(w0.w,w1.w,w2.w)*warp*.4;J=mat3(vec3(w0.x,w1.x,w2.x),vec3(w0.y,w1.y,w2.y),vec3(w0.z,w1.z,w2.z))*warp*.4;}
  float amp=1.;vec4 res=vec4(0.);
  vec4 wt=vec4(0.,0.,0.,1.);vec3 ds=vec3(0.);float norm=1./LF[s].w;
  for(int k=0;k<n;k++){
    vec4 N;
    float wf=warp>0.?1.-smoothstep(7.,11.,float(k)):0.;
    if(wf>0.){N=sn(s,k,d+w*wf);N.xyz+=(N.xyz*J)*wf;}else N=sn(s,k,d);
    float ow=k==n-1?last:1.;
    N*=ow;
    float damp=1.;
    if(ero>0.){vec3 nd=N.xyz/LF[s+k].w;ds+=nd*amp;damp=1./(1.+ero*dot(ds,ds));}
    if(type==0){res+=N*amp*damp;}
    else if(type==1){res+=(N.w<0.?-N:N)*amp*damp;}
    else if(type==2){ // heterogeneous terrain
      vec4 sg=N;sg.w+=off;
      if(k==0)res=sg;else res+=dmul(sg,res)*amp*damp;
    } else if(type==3){ // hybrid multifractal
      vec4 sg=N;sg.w+=off;
      if(k==0){res=sg;wt=sg*gn;}else{
        if(wt.w>1.)wt=vec4(0.,0.,0.,1.);else if(wt.w<0.)wt=vec4(0.);
        vec4 c=dmul(wt,sg);res+=c*amp*damp;wt=c*gn;}
    } else { // ridged multifractal
      vec4 sg=(N.w<0.?N:-N);sg.w+=off*(ow>.999?1.:ow);
      vec4 s2=dmul(sg,sg);
      if(k==0){res=s2;wt=vec4(0.,0.,0.,1.);}else{res+=dmul(s2,wt)*amp*damp;}
      vec4 nw=s2*gn;if(nw.w>1.)nw=vec4(0.,0.,0.,1.);else if(nw.w<0.)nw=vec4(0.);wt=nw;
    }
    amp*=ga;
  }
  if(type==4)res.w-=.6,res*=.6;
  return res;
}
vec4 craters(int pi,vec3 d,float lod){
  vec4 a=uP[pi],b=uP[pi+1];int s=int(a.x),maxO=int(a.y);float depth=a.z,rim=a.w,amp=1.,fall=b.z;
  float oc=clamp((lod-b.x)*b.y,0.,float(maxO));int n=int(ceil(oc));vec4 res=vec4(0.);
  for(int k=0;k<n;k++){
    vec4 fw=LF[s+k];mat3 R=ROT[k&3];vec3 p=R*d*fw.w;vec3 xs=fw.xyz+p+dot(p,vec3(1./3.));
    vec3 fl=floor(xs);ivec3 c=LI[s+k].xyz+ivec3(fl);vec3 f=xs-fl;float ow=k==n-1?oc-float(n-1):1.;
    for(int i=0;i<8;i++){ivec3 o=ivec3(i&1,(i>>1)&1,(i>>2)&1);
      vec3 r3=rand3(c+o);float rr=.12+.3*r3.x*r3.x;if(fract(r3.y*17.)>.55)continue;
      vec3 q=vec3(o)+r3*.6+.2-f;q-=dot(q,vec3(1./6.));
      float l=length(q),x=l/rr;if(x>1.7)continue;
      float h,dh;
      if(x<1.){h=x*x-1.;dh=2.*x;h+=rim;}else{float u=(x-1.)/.7;float v=1.-u;h=rim*v*v;dh=-2.*rim*v/.7;}
      float e=smoothstep(1.7,1.3,x);
      float sc=amp*rr*depth*ow;
      vec3 g=-(q/max(l,1e-6))*dh/rr*fw.w*sc*e;
      res+=vec4(g*R,h*sc*e);
    }
    amp*=fall;
  }
  return res;
}
vec4 boulders(int pi,vec3 d,float lod){
  vec4 a=uP[pi],b=uP[pi+1];int s=int(a.x),maxO=int(a.y);float size=a.z,amp=1.,fall=b.z;
  float oc=clamp((lod-b.x)*b.y,0.,float(maxO));int n=int(ceil(oc));vec4 res=vec4(0.);
  for(int k=0;k<n;k++){
    vec4 fw=LF[s+k];mat3 R=ROT[k&3];vec3 p=R*d*fw.w;vec3 xs=fw.xyz+p+dot(p,vec3(1./3.));
    vec3 fl=floor(xs);ivec3 c=LI[s+k].xyz+ivec3(fl);vec3 f=xs-fl;float ow=k==n-1?oc-float(n-1):1.;
    for(int i=0;i<8;i++){ivec3 o=ivec3(i&1,(i>>1)&1,(i>>2)&1);
      vec3 r3=rand3(c+o);if(fract(r3.y*23.)>.5)continue;float rr=.1+.3*r3.z;
      vec3 q=vec3(o)+r3-f;q-=dot(q,vec3(1./6.));float l2=dot(q,q)/(rr*rr);if(l2>=1.)continue;
      float h=sqrt(1.-l2);float sc=amp*rr*size*ow/fw.w*uR;
      res+=vec4((q/(rr*rr*max(h,.05))*fw.w*sc)*R,h*sc);
    }
    amp*=fall;
  }
  return res;
}
`;

const LIGHT = `
const float PI=3.14159265;
struct Surf{float dh,r;vec3 d;};
// Camera-relative point to radial offset and unit-sphere offset, stable at millimetre scale.
Surf surf(vec3 p){float bb=2.*(uR+uA)*dot(p,uU)+dot(p,p);float rr=(uR+uA)*(uR+uA)+bb;float r=sqrt(max(rr,1e-6));
  float dh=bb/(r+uR+uA);return Surf(dh,r,(p-uU*dh)/r);}
float hash(vec2 p){return fract(52.9829189*fract(dot(p+float(uFrame%64)*5.588238,vec2(.06711056,.00583715))));}
// Ray/shell: distances to radius R+h from the camera, stable when the camera is close.
vec2 shell(float h,float mu){float rc=uR+uA;float b=rc*mu;float c=(uA-h)*(2.*uR+uA+h);float D=b*b-c;
  if(D<0.)return vec2(-1.,-2.);float q=sqrt(D);float t1=-b+q,t0=-b-q;
  if(b<0.)t0=c/t1;else t1=c/t0;return vec2(min(t0,t1),max(t0,t1));}
vec3 transLUT(float h,float mu){if(uAtmOn<.5)return vec3(1.);
  return texture(uTrans,vec2(sqrt(clamp(h/uAtmTop,0.,1.)),.5+.5*mu)).rgb;}
void atmosphere(vec3 d,float tMax,int N,float jit,out vec3 L,out vec3 T){
  L=vec3(0.);T=vec3(1.);if(uAtmOn<.5)return;
  float mu=dot(d,uU);vec2 sh=shell(uAtmTop,mu);if(sh.y<0.)return;
  float t0=max(sh.x,0.),t1=min(sh.y,tMax);if(t1<=t0)return;
  float dt=(t1-t0)/float(N),cs=dot(d,uSun);
  float pr=.0596831*(1.+cs*cs);float g=uMieG;float pm=.1193662*(1.-g*g)*(1.+cs*cs)/((2.+g*g)*pow(max(1.+g*g-2.*g*cs,1e-3),1.5));
  vec3 od=vec3(0.);vec3 rc=uU*(uR+uA);
  for(int i=0;i<N;i++){float t=t0+dt*(float(i)+jit);vec3 p=rc+d*t;float r=length(p);float h=max(r-uR,0.);
    float dr=exp(-h/uHr),dm=exp(-h/uHm);
    vec3 ext=uBetaR*dr+uBetaM*1.1*dm;
    od+=ext*dt*.5;
    vec3 Ts=transLUT(h,dot(p/r,uSun));
    vec3 Tv=exp(-od);
    vec3 sc=(uBetaR*dr*pr+uBetaM*dm*pm);
    L+=Tv*Ts*sc*dt;
    // first-order stand-in for multiple scattering, so twilight and shadows are not black
    L+=Tv*(uBetaR*dr+uBetaM*dm)*Ts*.035*dt;
    od+=ext*dt*.5;}
  T=exp(-od);L*=uSunCol;
}
vec3 skyAmbient(float h,vec3 up){if(uAtmOn<.5)return vec3(.0015);float cs=dot(up,uSun);vec3 Tz=transLUT(h,clamp(cs,-.2,1.));
  float k=smoothstep(-.25,.3,cs);return (uBetaR*uHr*.6+vec3(.04)*uBetaM*uHm*10.)*Tz*uSunCol*(k*.9+.03)+.0015;}
`;

const SPACE = `
float vnoise(vec3 p){vec3 i=floor(p),f=p-i;f=f*f*(3.-2.*f);ivec3 c=ivec3(i);
  float a[8];for(int k=0;k<8;k++)a[k]=rand3(c+ivec3(k&1,(k>>1)&1,(k>>2)&1)).x;
  return mix(mix(mix(a[0],a[1],f.x),mix(a[2],a[3],f.x),f.y),mix(mix(a[4],a[5],f.x),mix(a[6],a[7],f.x),f.y),f.z);}
float fbm3(vec3 p,int n){float s=0.,a=.5;for(int i=0;i<n;i++){s+=a*vnoise(p);p=p*2.03+7.1;a*=.5;}return s;}
vec3 hue(float h){return .5+.5*cos(6.2832*(h+vec3(0.,.33,.67)));}
vec3 starfield(vec3 d){
  vec3 col=vec3(0.);
  for(int l=0;l<3;l++){float sc=90.*pow(2.1,float(l));vec3 q=d*sc;vec3 c=floor(q);vec3 r=rand3(ivec3(c)+ivec3(l*91));
    if(r.x>.965){vec3 off=q-(c+.3+.4*fract(r*37.));float m=exp(-dot(off,off)*(70.+60.*float(l)));
      float temp=fract(r.y*19.);col+=mix(vec3(1.,.72,.5),vec3(.7,.82,1.),temp)*m*r.z*r.z*(2.2-float(l)*.5);}}
  float band=exp(-pow(dot(d,normalize(vec3(.2,.9,.3)))*3.4,2.));
  float n=fbm3(d*3.1+uHue*9.,5),m=fbm3(d*7.+n*2.,4);
  vec3 neb=mix(hue(uHue),hue(uHue+.3),m)*pow(n,3.)*1.1;
  return col*uStars+(neb*uNebula*.08+vec3(.5,.55,.7)*band*.018*(.5+m)*uStars);
}
// Returns colour and alpha of the nearest moon; t in km along d.
vec4 moons(vec3 d,out float tm){
  vec4 best=vec4(0.);tm=1e20;
  for(int i=0;i<uMoons;i++){vec3 c=uMoon[i].xyz;float rad=uMoon[i].w;float b=dot(c,d);float cc=dot(c,c)-rad*rad;float D=b*b-cc;
    if(D<0.||b<0.)continue;float q=sqrt(D),t=b-q;if(t>tm)continue;
    vec3 n=normalize(d*t-c);vec3 tx=n*3.1+uMoonCol[i].w*.001;
    float h=fbm3(tx,6);float cr=fbm3(tx*3.3,4);float marks=smoothstep(.42,.5,h)*.35+smoothstep(.5,.58,cr)*.18;
    float nl=max(dot(n,uSun),0.);
    float edge=clamp(q/(rad*.02),0.,1.);
    best=vec4(uMoonCol[i].rgb*(.62+marks-.15)*nl*uSunCol*.18,edge);tm=t;}
  return best;
}
vec4 rings(vec3 d,out float tr){
  tr=1e20;if(uRingA.w<=0.)return vec4(0.);
  vec3 c=uU*(uR+uA);float dn=dot(d,uRingN);if(abs(dn)<1e-5)return vec4(0.);
  float t=-dot(c,uRingN)/dn;if(t<=0.)return vec4(0.);
  vec3 p=c+d*t;float r=length(p)/uR;float u=(r-uRingA.x)/(uRingA.y-uRingA.x);if(u<0.||u>1.)return vec4(0.);
  vec4 tex=texture(uRing,vec2(u,.5));float a=tex.r*uRingA.w;
  // planet shadow
  float b=dot(-p,uSun);float dd=dot(p,p)-b*b;float sh=(b>0.&&dd<uR*uR)?0.:1.;
  tr=t;return vec4(uRingCol*tex.g*sh*.06*uSunCol,a);
}
float ringShadow(vec3 p){ // p planet-centred
  if(uRingA.w<=0.)return 1.;float dn=dot(uSun,uRingN);if(abs(dn)<1e-4)return 1.;
  float t=-dot(p,uRingN)/dn;if(t<0.)return 1.;vec3 q=p+uSun*t;float u=(length(q)/uR-uRingA.x)/(uRingA.y-uRingA.x);if(u<0.||u>1.)return 1.;
  return 1.-texture(uRing,vec2(u,.5)).r*uRingA.w;
}
`;

const CLOUD = `
float coverage(vec3 dc,float lod){
  // warp by the two broadest octaves, which draws the long swirled fronts
  float w0=snv(${FIXED.cloud},0,dc),w1=snv(${FIXED.cloud},1,dc);
  vec3 q=dc+vec3(w0,w1,w0-w1)*.09;
  float v=w0*.5+w1*.3,a=.27;int n=int(clamp(lod-1.,3.,10.));
  for(int k=2;k<n;k++){float x=snv(${FIXED.cloud},k,q);v+=a*x;a*=.56;}
  float lat=dc.y+uU.y;
  return v+.13*cos(lat*7.5);
}
float cloudDensity(vec3 dc,float hf,float lod){
  float cov=coverage(dc,lod)+ (uCover-.5)*1.05;
  float prof=smoothstep(0.,.18,hf)*smoothstep(1.,.35,hf);
  float d=cov*1.7-.1-(1.-prof)*.8;
  if(d<=0.)return 0.;
  return clamp(d,0.,1.);
}
// front-to-back march through the cloud shell. rgb colour, a transmittance.
vec4 clouds(vec3 d,float tMax,float jit,out float tFirst){
  tFirst=-1.;
  if(uCover<=.001||uStyle==0)return vec4(0.,0.,0.,1.);
  float mu=dot(d,uU);float hLo=uCloudLo+max(uSea,0.),hHi=uCloudHi+max(uSea,0.);
  vec2 top=shell(hHi,mu),bot=shell(hLo,mu);if(top.y<0.)return vec4(0.,0.,0.,1.);
  float t0,t1;
  if(uA>hHi){t0=top.x;t1=(bot.y>0.&&bot.x>0.)?bot.x:top.y;}
  else if(uA<hLo){t0=bot.y;t1=top.y;}
  else{t0=0.;t1=(bot.y>0.&&bot.x>0.)?bot.x:top.y;}
  float tFade=t0+max(uA*4.,320.);t1=min(t1,tMax);t1=min(t1,tFade);if(t1<=t0||t0<0.)return vec4(0.,0.,0.,1.);
  int N=uCloudSteps;float dt=(t1-t0)/float(N);float T=1.;vec3 C=vec3(0.);
  float cs=dot(d,uSun);float ph=mix(.0795,.0795*(1.+6.*pow(max(cs,0.),12.)),.7);
  vec3 p;float shellT=hHi-hLo;
  for(int i=0;i<N&&T>.02;i++){
    float t=t0+dt*(float(i)+jit);p=d*t;Surf s=surf(p);float h=uA+s.dh;float hf=(h-hLo)/shellT;
    if(hf<0.||hf>1.)continue;
    float foot=max(t*uPix,dt*.3);float lod=-log2(foot/uR)-1.;
    vec3 dc=uCloudRot*s.d;
    float dn=cloudDensity(dc,hf,lod);
    if(dn<=.01)continue;
    if(tFirst<0.)tFirst=t;
    float ext=dn*dn*uCloudDen*.7*(1.-smoothstep(.55,1.,(t-t0)/(tFade-t0)));
    float a=exp(-ext*dt);
    // light: one coarse sample toward the sun
    vec3 q=p+uSun*shellT*.5;Surf sq=surf(q);float dl=cloudDensity(uCloudRot*sq.d,clamp((uA+sq.dh-hLo)/shellT,0.,1.),lod-2.);
    float tl=exp(-dl*uCloudDen*shellT*.35)*.85+.15;
    vec3 up=(p+uU*(uR+uA))/s.r;
    vec3 Ts=transLUT(h,dot(up,uSun));
    vec3 sun=Ts*uSunCol*tl*ph*3.4;
    vec3 amb=skyAmbient(h,up)*.5*(.6+.4*hf);
    C+=T*(1.-a)*uCloudCol*(sun+amb);
    T*=a;
  }
  return vec4(C,T);
}
float cloudShadow(vec3 p){
  if(uCover<=.001||uStyle==0)return 1.;
  float mu=dot(uSun,normalize(p+uU*(uR+uA)));if(mu<=0.)return 1.;
  vec3 q=p+uSun*((uCloudLo+uCloudHi)*.5/max(mu,.15));Surf s=surf(q);
  float dn=cloudDensity(uCloudRot*s.d,.5,9.);
  return mix(1.,.35,smoothstep(0.,.5,dn));
}
`;

const SURFACE = `
// Band-limited fBm for albedo: only octaves near the footprint, so colour detail is stable at any scale.
float detailFBM(vec3 d,float lod,int span,int top){
  float k1=clamp(lod-1.,0.,float(${FIXED.detailOct-1}));int hi=int(k1);int lo=max(hi-span,0);
  float v=0.,a=1.,tot=0.;
  for(int k=hi;k>=lo;k--){float w=k==hi?fract(k1)+.001:1.;v+=a*w*snv(${FIXED.detail},k,d);tot+=a*w;a*=1.35;}
  return v/max(tot,1e-3);
}
vec3 shadeGround(vec3 d,vec3 up,vec3 n,float h,float foot,float lod,float hs,out float rough){
  float flat_=dot(n,up);
  float lat=abs(dot(up,normalize(vec3(0.,1.,0.))));
  float temp=uTemp+16.-48.*lat*lat-4.2*max(h-uSea,0.);
  float mN=detailFBM(d,lod,4,0);
  float macro=snv(${FIXED.detail},2,d)*.6+snv(${FIXED.detail},4,d)*.3+snv(${FIXED.detail},7,d)*.1;
  float moist=clamp(.5+uMoist+macro*.8-.25*abs(lat-.45),0.,1.);
  float tn=clamp((temp+25.)/70.,0.,1.);
  vec3 alb=texture(uPal,vec2(tn,moist)).rgb;
  alb*=1.+mN*.2;
  // rock: strata fold with height and low-frequency warp
  float st=h*2.3+macro*1.5;float band=.5+.5*sin(st*6.28+mN);
  vec3 rock=mix(texture(uPal,vec2(.02,.98)).rgb,texture(uPal,vec2(.1,.98)).rgb,band);rock*=1.+mN*.28;
  float nearK=smoothstep(17.,22.,lod);float steep=smoothstep(mix(.84,.5,nearK),mix(.95,.74,nearK),flat_+macro*.04);
  alb=mix(rock,alb,steep);
  // snow gathers on gentle slopes under the snow line
  float sn=smoothstep(2.,-5.,temp+macro*7.+mN*1.2)*smoothstep(.74,.9,flat_+macro*.04);
  alb=mix(alb,vec3(.86,.9,.95),sn);
  rough=mix(.9,.35,sn);
  return alb;
}
`;

const TRACE = `
struct Hit{float t;int kind;float mapH;};
// Log-polar height map centred under the camera: fine nearby, coarse at the horizon.
vec2 mapUV(vec3 d,out float rho){vec3 e=uMapE+d;rho=length(e);rho=2.*asin(min(rho*.5,1.));
  float th=atan(dot(e,uMapT2),dot(e,uMapT1));
  return vec2(th/6.2831853+.5,(log(max(rho,1e-12))-uMapL.x)*uMapL.y);}
float mapHeight(vec3 d,out float texel){float rho;vec2 uv=mapUV(d,rho);texel=max(rho,exp(uMapL.x))*uR*uMapTexel;return texture(uMap,uv).r;}
// Cheap stage walks the map; the exact fractal only runs within error of the surface.
Hit march(vec3 d,int maxSteps,float pix,float jit){
  float mu=dot(d,uU);Hit H;H.kind=0;H.t=-1.;H.mapH=0.;
  vec2 top=shell(uHMax,mu);if(top.y<0.)return H;
  float tMin=max(top.x,0.),tEnd=top.y;
  vec2 bot=shell(uHMin,mu);if(bot.y>0.&&bot.x>0.)tEnd=min(tEnd,bot.x);
  float tSea=-1.;
  if(uSeaType!=3&&uA>uSea){vec2 sv=shell(uSea,mu);if(sv.y>0.&&sv.x>0.){tSea=sv.x;tEnd=min(tEnd,tSea);}}
  float t=tMin+1e-6,pt=t,pv=-1.;int fine=uFine;
  for(int i=0;i<maxSteps;i++){
    vec3 p=d*t;Surf s=surf(p);float h=uA+s.dh;
    float foot=max(t*pix,1e-7);
    float tx;float mh=mapHeight(s.d,tx);
    float err=max(tx*1.2,foot*2.);
    float dm=h-mh;
    if(dm>err){pv=-1.;t+=max((dm-err)*.75,foot);if(t>tEnd)break;continue;}
    vec4 tr=terrain(s.d,-log2(foot/uR));
    float dist=h-tr.w;H.mapH=mh;
    if(dist<foot*.6||fine<=0){
      if(pv>0.&&dist<0.){t=pt+(t-pt)*clamp(pv/(pv-dist),0.,1.);}
      H.t=t;H.kind=1;return H;}
    fine--;
    vec3 upl=(p+uU*(uR+uA))/s.r;vec3 gt=(tr.xyz-upl*dot(tr.xyz,upl))/uR;
    pt=t;pv=dist;
    t+=max(dist*.8/sqrt(1.+dot(gt,gt)*.5),foot*.5);
    if(t>tEnd)break;
  }
  if(tSea>0.){H.t=tSea;H.kind=2;}
  return H;
}
float sunShadow(vec3 p,vec3 up,float h,float foot){
  float nl=dot(up,uSun);if(nl<-.2)return 0.;
  float res=1.,s=max(foot*3.,.003);
  for(int i=0;i<uShadow;i++){vec3 q=p+uSun*s;Surf u=surf(q);float hq=uA+u.dh;if(hq>uHMax)break;
    float tx;float mh=mapHeight(u.d,tx);
    float dd=hq-mh;
    res=min(res,clamp(.5+6.*dd/(s*.12+tx+1e-5),0.,1.));
    if(res<.01)break;
    s+=max(dd*.7,max(s*.12,tx*.7));
  }
  return res;
}
vec3 waterNormal(vec3 d,vec3 up,float foot,out float fine){
  float lod=-log2(foot/uR);
  float k1=clamp(lod-2.,0.,float(${FIXED.waveOct-1}));int hi=int(k1),lo=max(hi-5,0);
  vec3 g=vec3(0.);float a=1.;
  float kc=19.;  // waves stop at metre scale and swell at about 100 km
  for(int k=min(hi,27);k>=max(lo,10);k--){vec4 N=sn(${FIXED.wave},k,d+uU*0.+vec3(uTime*.0000012)/ (LF[${FIXED.wave}+k].w*1e-5));g+=N.xyz/LF[${FIXED.wave}+k].w*a*(1.-.05*abs(float(k)-kc));a*=1.2;}
  fine=clamp((27.-k1)/10.,0.,1.);
  g-=up*dot(g,up);
  return normalize(up-g*.035*fine);
}
vec3 skyDir(vec3 d,float h){ // quick sky colour for reflections
  float s=max(d.y*0.+dot(d,uU),0.);vec3 z=skyAmbient(h,uU);
  return z*(1.4-.8*s)+vec3(.0015);
}
// Wireframe preview: the map-marched surface, lit flat, with a latitude/longitude grid and
// height contours whose spacing follows the camera's altitude. Very cheap.
vec3 wire(vec3 d,float jit,out float depth){
  Hit H=march(d,uSteps,uPix,jit);depth=H.t;
  float sky=clamp(dot(d,uU)*.5+.5,0.,1.);
  if(H.kind==0)return mix(vec3(.06,.06,.09),vec3(.16,.16,.22),sky)*4.;
  vec3 p=d*H.t;Surf s=surf(p);vec3 up=(p+uU*(uR+uA))/s.r;
  float foot=max(H.t*uPix,1e-7);float lod=-log2(foot/uR);
  vec3 n=up;float h=uSea;
  if(H.kind==1){vec4 t=terrain(s.d,min(lod,18.));vec3 gt=(t.xyz-up*dot(t.xyz,up))/uR;n=normalize(up-gt);h=t.w;}
  float dif=max(dot(n,uSun),0.)*.75+.25;
  vec3 base=H.kind==1?vec3(.54,.54,.66):vec3(.3,.34,.46);
  // grid in degrees, coarsened by powers of ten with distance
  float scaleKm=max(H.t,uA)*.25;float deg=scaleKm/uR*57.2958;float step_=pow(10.,ceil(log(max(deg,1e-7))/log(10.)));
  float la=asin(clamp(up.y,-1.,1.))*57.2958,lo=atan(up.z,up.x)*57.2958;
  vec2 g=vec2(la,lo)/step_;vec2 fw=fwidth(g)+1e-6;vec2 gq=abs(fract(g-.5)-.5)/fw;
  float line=1.-clamp(min(gq.x,gq.y),0.,1.);
  float cs=pow(10.,ceil(log(max(scaleKm*.15,1e-6))/log(10.)));float ch=h/cs;float cl=abs(fract(ch-.5)-.5)/(fwidth(ch)+1e-6);
  float cont=(1.-clamp(cl,0.,1.))*float(H.kind==1);
  vec3 col=base*dif*2.2;col=mix(col,vec3(3.2),line*.8);col=mix(col,vec3(1.1,.75,.35)*2.,cont*.55);
  return col;
}
vec3 render(vec3 d,float jit,out float depth){
  if(uStyle==2)return wire(d,jit,depth);
  float tm,tr;vec3 col=vec3(0.);
  Hit H=march(d,uSteps,uPix,jit);depth=H.t;
  float tMax=H.kind>0?H.t:1e12;
  vec2 ringMiss=vec2(0.);
  vec4 ring=rings(d,tr);
  if(H.kind==0){
    // sky behind: stars, moons, then sun
    col=starfield(d);
    vec4 mo=moons(d,tm);col=mix(col,mo.rgb,mo.a);
    float cs=dot(d,uSun);float sz=uP[95].x;
    float disc=smoothstep(cos(sz*1.08),cos(sz),cs);
    if(mo.a<.5)col+=uSunCol*disc*18.;
    col+=uSunCol*pow(max(cs,0.),3000.)*.05;
    if(ring.a>0.&&tr<1e19){col=mix(col,ring.rgb,ring.a);}
  } else {
    vec3 p=d*H.t;Surf s=surf(p);float h=uA+s.dh;vec3 up=(p+uU*(uR+uA))/s.r;
    float foot=max(H.t*uPix,1e-7);float lod=-log2(foot/uR);
    float nl,sh=1.;vec3 amb=skyAmbient(h,up);vec3 Ts=transLUT(h,dot(up,uSun));vec3 sunc=Ts*uSunCol;
    if(H.kind==1){
      vec4 tr1=terrain(s.d,lod);
      vec3 gt=(tr1.xyz-up*dot(tr1.xyz,up))/uR;
      vec3 n=normalize(up-gt);
      float rough;vec3 alb=shadeGround(s.d,up,n,tr1.w,foot,lod,h,rough);
      // cheap occlusion: how far below the smoothed surface this point lies
      float ao=clamp(1.-(H.mapH-tr1.w)/(foot*18.+.0001),.25,1.);
      nl=max(dot(n,uSun),0.);
      if(nl>0.)sh=sunShadow(p+up*foot*1.5,up,h,foot);
      sh*=cloudShadow(p)*ringShadow(p+uU*(uR+uA));
      col=alb*(sunc*nl*sh*.2+amb*ao*(.4+.3*dot(n,up)));
      if(uLava>.5){float c=smoothstep(.5,0.,abs(snv(${FIXED.detail},8,s.d)))*smoothstep(uSea+1.2,uSea,tr1.w);col+=vec3(1.3,.26,.03)*c*.8;}
      vec3 rv=reflect(d,n);col+=sunc*sh*pow(max(dot(rv,uSun),0.),24.)*(1.-rough)*.05;
    } else {
      float fine;vec3 n=waterNormal(s.d,up,foot,fine);
      float bed=terrain(s.d,min(lod,13.)).w;float depthW=max(uSea-bed,0.);
      float F=.02+.98*pow(1.-max(dot(-d,n),0.),5.);
      vec3 rv=reflect(d,n);if(dot(rv,up)<0.)rv=reflect(rv,up);
      nl=max(dot(up,uSun),0.);
      sh=cloudShadow(p)*ringShadow(p+uU*(uR+uA));
      if(uSeaType==1){ // lava sea: emits, cracked crust floats on it
        float crust=smoothstep(-.1,.25,detailFBM(s.d,min(lod,16.),4,0)+snv(${FIXED.detail},6,s.d)*.4);
        col=mix(uSeaCol*2.4,vec3(.035,.03,.03)*(sunc*nl*.3+amb),crust);
      } else if(uSeaType==2){ // ice sheet
        float m=detailFBM(s.d,lod,4,0);vec3 alb=mix(vec3(.72,.84,.93),vec3(.93,.96,.99),.5+m*.6);
        col=alb*(sunc*nl*sh*.2+amb*.6);
      } else {
        vec3 deep=uSeaCol*.3,shal=uSeaCol*1.6+vec3(.0,.03,.03);
        vec3 body=mix(shal,deep,1.-exp(-depthW*1.6));
        float sg=pow(max(dot(rv,uSun),0.),mix(40.,1800.,fine));
        col=body*(sunc*nl*.28*sh+amb*.75);
        col=mix(col,skyDir(rv,h),F);
        col+=sunc*sg*sh*mix(.03,.9,fine);
        float foam=smoothstep(.022,.0,depthW)*(.6+.4*sin(uTime*1.3+detailFBM(s.d,lod,3,0)*14.));
        col=mix(col,(sunc*nl*.3+amb),foam*.6);
      }
    }
    if(ring.a>0.&&tr<H.t)col=mix(col,ring.rgb,ring.a);
  }
  // clouds and atmosphere, in order along the ray
  float tc;vec4 cl=clouds(d,tMax,jit,tc);
  vec3 L,T;
  if(tc>0.){
    vec3 L1,T1,L2,T2;atmosphere(d,tc,8,jit,L1,T1);
    // beyond the clouds, the remaining air shows through their holes
    atmosphere(d,tMax,10,jit,L2,T2);
    vec3 rest=max(L2-L1,vec3(0.))/max(T1,vec3(1e-3));
    vec3 Tr=T2/max(T1,vec3(1e-3));
    col=L1+T1*(cl.rgb+cl.a*(rest+Tr*col));
  } else {
    atmosphere(d,tMax,16,jit,L,T);
    col=L+T*col;
  }
  return col;
}
`;

export function fsMain(graphGlsl) {
  return HEAD + NOISE + graphGlsl + LIGHT + SPACE + CLOUD + SURFACE + TRACE + `
out vec4 oC;
void main(){
  vec2 px=(gl_FragCoord.xy+uJit)/uRes*2.-1.;
  vec3 d=normalize(uFwd+uRight*px.x*uTan*uAspect+uUp*px.y*uTan);
  float jit=hash(gl_FragCoord.xy);float depth;
  vec3 c=render(d,jit,depth);
  oC=vec4(min(c,vec3(200.)),1.);
}`;
}

// Fires one ray per texel, or evaluates terrain at far points, for picking and collision.
export function fsProbe(graphGlsl) {
  return HEAD + NOISE + graphGlsl + LIGHT + SPACE + CLOUD + SURFACE + TRACE + `
uniform sampler2D uQ;uniform int uMode;
out vec4 oC;
void main(){
  vec4 q=texelFetch(uQ,ivec2(gl_FragCoord.xy),0);
  if(uMode==0){ // q.xyz ray direction: t, kind
    Hit H=march(normalize(q.xyz),400,q.w,.5);oC=vec4(H.t,float(H.kind),0.,1.);
  } else { // q.xyz offset from nadir on the unit sphere, q.w lod
    vec4 t=terrain(q.xyz,q.w);vec3 u1=normalize(uU+q.xyz);oC=vec4(t.w,length(t.xyz-u1*dot(t.xyz,u1))/uR,0.,1.);
  }
}`;
}

export function fsMap(graphGlsl) {
  return HEAD + NOISE + graphGlsl + `
out vec4 oC;
void main(){
  float th=(vUv.x-.5)*6.2831853;float lr=uMapL.x+vUv.y/uMapL.y;float rho=exp(lr);
  float sr=sin(rho),hc=2.*sin(rho*.5);hc*=hc*.5;
  vec3 d=-uMapC*hc+sr*(cos(th)*uMapT1+sin(th)*uMapT2);
  float texel=rho*uMapTexel;float lod=-log2(max(texel,1e-10));
  oC=vec4(terrain(d,lod).w,0.,0.,1.);
}`;
}

export const FS_LUT = `#version 300 es
precision highp float;in vec2 vUv;out vec4 o;
uniform vec3 uBetaR,uBetaM;uniform float uHr,uHm,uAtmTop,uR;
void main(){float h=vUv.x*vUv.x*uAtmTop,mu=vUv.y*2.-1.,r=uR+h;
  float b=r*mu,c=(h-uAtmTop)*(2.*uR+h+uAtmTop),D=b*b-c;
  // sun below the horizon
  float gb=r*r*(mu*mu-1.)+uR*uR;
  if(mu<0.&&gb>0.){o=vec4(0.,0.,0.,1.);return;}
  float t=-b+sqrt(max(D,0.));vec3 od=vec3(0.);float dt=t/48.;
  for(int i=0;i<48;i++){float s=dt*(float(i)+.5);float hh=sqrt(r*r+s*s+2.*r*s*mu)-uR;hh=max(hh,0.);od+=(uBetaR*exp(-hh/uHr)+uBetaM*1.1*exp(-hh/uHm))*dt;}
  o=vec4(exp(-od),1.);}`;

export const FS_BLIT = `#version 300 es
precision highp float;in vec2 vUv;out vec4 o;uniform sampler2D uTex;uniform float uExp;
vec3 tone(vec3 x){ // Hable-like filmic curve, gentle in the shadows
  x*=uExp*.22;const float a=2.51,b=.03,c=2.43,d=.59,e=.14;return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);}
void main(){vec3 c=texture(uTex,vUv).rgb;c=tone(c);c=pow(c,vec3(1./2.2));
  float n=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  o=vec4(c+(n-.5)/255.,1.);}`;
