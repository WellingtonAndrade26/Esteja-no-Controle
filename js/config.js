window.ENC_CONFIG = {
  supabaseUrl: "https://iyfknonepcarerlpcxlu.supabase.co",
  supabasePublishableKey: "sb_publishable_V4zEvBC8ZNYN8vSzmBq_rg_2EPjFqYZ",
  appName: "Esteja no Controle",
  appVersion: "1.0.11",
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
    script.async = true;
    script.setAttribute(`data-${marker}`, "1");
    document.head.appendChild(script);
  };

  load("./js/card-management.js?v=1.0.11", "enc-card-management");
  load("./js/card-limit-sync.js?v=1.0.11", "enc-card-limit-sync");
})();
