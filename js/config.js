window.ENC_CONFIG = {
  supabaseUrl: "https://iyfknonepcarerlpcxlu.supabase.co",
  supabasePublishableKey: "sb_publishable_V4zEvBC8ZNYN8vSzmBq_rg_2EPjFqYZ",
  appName: "Esteja no Controle",
  appVersion: "1.0.6",
  publicBaseUrl: "",
  legalOwner: "Wellington Porto de Andrade",
  supportEmail: "",
  privacyLastUpdated: "2026-08-17"
};

(() => {
  if (document.querySelector('script[data-enc-card-management]')) return;
  const script = document.createElement("script");
  script.src = "./js/card-management.js?v=1.0.6";
  script.async = true;
  script.dataset.encCardManagement = "1";
  document.head.appendChild(script);
})();
