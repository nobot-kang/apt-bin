// Fit the concealed card using rendered text, including Korean wrapping and fonts.
export function fitCardHints(surface) {
  const panel=surface.querySelector('.hint-panel'),content=surface.querySelector('.hint-content');
  if(!panel||!content)return;
  surface.style.removeProperty('height');
  const available=()=>{
    const style=getComputedStyle(panel);
    return panel.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  };
  // Keep metadata readable; only the title and whitespace become more compact.
  for(let step=0;step<=8;step++){
    content.style.setProperty('--hint-name-scale',String(1-step*.025));
    content.style.setProperty('--hint-spacing',String(1-step*.06));
    content.style.setProperty('--hint-name-leading',String(1.25-step*.0125));
    if(content.offsetHeight<=available())return;
  }
  // Very large accessibility fonts must still show the whole name and every hint.
  surface.style.height=`${surface.offsetHeight+Math.ceil(content.offsetHeight-available())+1}px`;
}

export function watchCardHints(surface) {
  if(!surface)return ()=>{};
  let frame;
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>fitCardHints(surface));};
  // Observe the available width, not our fitted content height, to avoid feedback.
  let width;
  const widthObserver=new ResizeObserver(entries=>{
    const next=entries[0].contentRect.width;
    if(next!==width){width=next;schedule();}
  });
  widthObserver.observe(surface.parentElement);
  window.addEventListener('resize',schedule);
  document.fonts.addEventListener('loadingdone',schedule);
  fitCardHints(surface);
  return ()=>{
    cancelAnimationFrame(frame);widthObserver.disconnect();
    window.removeEventListener('resize',schedule);
    document.fonts.removeEventListener('loadingdone',schedule);
  };
}
