window.ENC_CONFIG = {
  supabaseUrl: "https://iyfknonepcarerlpcxlu.supabase.co",
  supabasePublishableKey: "sb_publishable_V4zEvBC8ZNYN8vSzmBq_rg_2EPjFqYZ",
  appName: "Esteja no Controle",
  appVersion: "1.0.21",
  publicBaseUrl: "",
  legalOwner: "Wellington Porto de Andrade",
  supportEmail: "",
  privacyLastUpdated: "2026-08-17"
};

(() => {
  const load = (src, marker) => {
    if (document.querySelector(`script[data-${marker}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.setAttribute(`data-${marker}`, "1");
    document.head.appendChild(script);
  };

  load("./js/card-management.js?v=1.0.21", "enc-card-management");
  load("./js/card-limit-sync.js?v=1.0.21", "enc-card-limit-sync");
  load("./js/ai-complete.js?v=1.0.21", "enc-ai-complete");
  load("./js/benefits.js?v=1.0.21", "enc-benefits");
  load("./js/benefits-keeper.js?v=1.0.21", "enc-benefits-keeper");
  load("./js/benefits-manager.js?v=1.0.21", "enc-benefits-manager");
  load("./js/benefits-delete-fix.js?v=1.0.21", "enc-benefits-delete-fix");
  load("./js/dashboard-accounting.js?v=1.0.21", "enc-dashboard-accounting");
})();
