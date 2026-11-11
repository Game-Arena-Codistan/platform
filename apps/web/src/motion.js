let observer=null;
const AUTO='.page > section,.page > .section-block,.page-head,.section-block,.section-head,.spotlight-card,.feature-card,.grid > *,.plan-grid > *,.step-grid > *,.room-grid > *,.tournament-grid > *,.faq-grid > *,.topup-grid > *,.split > *,.competition-layout > *,.metric-row > *,.reward-item,.ledger-row,.voucher-card,.empty,.notice,.feed-slide';
function reduced(){return document.documentElement.classList.contains('reduce-motion')||window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
function revealAll(root){root.querySelectorAll('[data-reveal]').forEach(n=>n.classList.add('is-visible'));}
function inView(node){
  const rect=node.getBoundingClientRect();
  const vh=window.innerHeight||document.documentElement.clientHeight;
  return rect.bottom>24&&rect.top<vh*0.92&&rect.height>0;
}
/** Jobup/AOS-style scroll reveals across painted routes. */
export function bindMotion(root=document){
  root.querySelectorAll(AUTO).forEach(n=>{if(!n.hasAttribute('data-reveal'))n.setAttribute('data-reveal','');});
  if(reduced()){revealAll(root);return;}
  if(observer)observer.disconnect();
  observer=new IntersectionObserver(entries=>{
    for(const e of entries){if(!e.isIntersecting)continue;e.target.classList.add('is-visible');observer.unobserve(e.target);}
  },{threshold:0.08,rootMargin:'0px 0px -4% 0px'});
  root.querySelectorAll('[data-reveal]').forEach((n,i)=>{
    if(n.classList.contains('is-visible'))return;
    if(!n.style.getPropertyValue('--reveal-delay'))n.style.setProperty('--reveal-delay',`${Math.min(i%8,7)*55}ms`);
    if(inView(n)){n.classList.add('is-visible');return;}
    observer.observe(n);
  });
}
