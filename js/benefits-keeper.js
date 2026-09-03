(() => {
  "use strict";
  const icon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 8h14"/><path d="M16 12h4v3h-4a1.5 1.5 0 0 1 0-3Z"/></svg>`;

  function button() {
    const el=document.createElement("button");
    el.className="nav-button enc-benefits-nav";
    el.dataset.pageTarget="benefits";
    el.setAttribute("aria-label","Vales");
    el.innerHTML=`<span class="nav-icon benefit-nav-icon">${icon}</span><span>Vales</span>`;
    return el;
  }

  function ensure() {
    const desktop=document.getElementById("desktopNav");
    if(desktop && !desktop.querySelector('[data-page-target="benefits"]')) {
      desktop.insertBefore(button(),desktop.querySelector('[data-page-target="cards"]')||null);
    }
    const bottom=document.getElementById("bottomNav");
    if(bottom && !bottom.querySelector('[data-page-target="benefits"]')) {
      bottom.insertBefore(button(),bottom.querySelector('[data-page-target="cards"]')||bottom.lastElementChild);
    }
    if(bottom) bottom.classList.add("enc-has-benefits");

    const select=document.querySelector('#dashboardBalanceForm select[name="balanceSource"]');
    if(select) [...select.options].forEach(option=>{if(/vale|\bvr\b/i.test(option.textContent||"")) option.remove();});

    const page=document.getElementById("page-benefits");
    if(page?.classList.contains("is-active")) {
      const title=document.getElementById("pageTitle");
      if(title) title.textContent="Vales";
    }
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>{ensure();setInterval(ensure,1500);},{once:true});
  else {ensure();setInterval(ensure,1500);}
})();
