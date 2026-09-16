(function () {
  "use strict";

  window.FSAI_COMMERCIAL_CONFIG = Object.freeze({
    booking: Object.freeze({
      path: "/book/",
      calendarUrl: "https://api.leadconnectorhq.com/widget/booking/Rb4aqLM1NdU5kvZcqNmj"
    }),
    websiteBuild: Object.freeze({
      minimumInvestment: "",
      typicalTimeline: "",
      depositTerms: ""
    }),
    aiOperationsAudit: Object.freeze({
      enabled: true,
      priceDisplay: "Starting around $1,500",
      creditDisplay: "May be credited toward an approved implementation project.",
      checkoutEnabled: false
    }),
    websiteBlueprint: Object.freeze({
      enabled: false,
      priceDisplay: "",
      checkoutUrl: "",
      termsUrl: "",
      termsApproved: false,
      fulfillmentApproved: false,
      creditPolicyApproved: false,
      creditedTowardBuild: null
    })
  });
})();
