// "What your assistant has learned": the brand style guide every connected assistant reads.
// Minimal by design: the owner's own assistant leads. Here the owner only reviews the guide,
// accepts or dismisses suggestions, deletes a bullet, or resets a brand (PIN when set).
import { learningDeleteBody, learningResetBody, learningSuggestionBody } from "./deskApi.js";
import { netName, node, toast, post } from "./deskUi.js";

let view = null;
let resetFor = null;

function bulletItem(row) {
  const li = node("li", { className: "learning-bullet", dataset: { bullet: row.id } });
  li.append(node("span", {}, row.text));
  li.append(node("span", { className: "learning-source" }, row.source === "history" ? "from your approvals" : "you accepted"));
  li.append(node("button", { type: "button", className: "btn tiny learning-delete", "aria-label": "Delete this note" }, "Delete"));
  return li;
}

function brandCard(brand) {
  const card = node("div", { className: "learning-card", dataset: { profile: brand.profile_id } });
  card.append(node("h3", {}, brand.name));
  const s = brand.stats;
  card.append(node("p", { className: "hint" }, s.decided ? `Based on ${s.decided} drafts you decided: ${s.approved_unedited} approved as written, ${s.approved_edited} edited, ${s.rejected} rejected.` : "Nothing learned yet. Approve or reject a few assistant drafts and it fills in here."));

  if (brand.pending.length) {
    const box = node("div", { className: "learning-pending" });
    box.append(node("h4", {}, "Suggested by your assistant"));
    for (const sug of brand.pending) {
      const row = node("div", { className: "learning-suggestion", dataset: { suggestion: sug.id } });
      row.append(node("p", {}, `${sug.network ? `${netName(sug.network)}: ` : ""}${sug.text}`));
      if (sug.why) row.append(node("p", { className: "hint" }, `Why: ${sug.why}`));
      const actions = node("div", { className: "earned-actions" });
      actions.append(node("button", { type: "button", className: "btn primary learning-accept" }, "Accept"), node("button", { type: "button", className: "btn secondary learning-dismiss" }, "Dismiss"));
      row.append(actions);
      box.append(row);
    }
    card.append(box);
  }

  const list = node("ul", { className: "learning-bullets" });
  for (const row of brand.bullets) list.append(bulletItem(row));
  for (const [network, rows] of Object.entries(brand.network_notes || {})) {
    list.append(node("li", { className: "learning-network" }, netName(network)));
    for (const row of rows) list.append(bulletItem(row));
  }
  if (list.children.length) card.append(list);
  if (brand.recent_rejections.length) {
    card.append(node("h4", {}, "Recent reasons you gave for rejecting"));
    const rej = node("ul", { className: "learning-rejections" });
    for (const r of brand.recent_rejections) rej.append(node("li", {}, `${netName(r.platform)}: ${r.reason}`));
    card.append(rej);
  }
  card.append(node("button", { type: "button", className: "btn secondary learning-reset" }, "Reset this brand's learning"));
  return card;
}

function render(payload) {
  if (!payload?.learning) return;
  view = payload.learning;
  const box = document.getElementById("learning-list");
  box.replaceChildren();
  if (!view.brands.length) {
    box.append(node("p", { className: "hint" }, "Add a brand first."));
    return;
  }
  for (const brand of view.brands) box.append(brandCard(brand));
}

async function load() {
  const response = await fetch(deskUrl("learning"));
  if (!response.ok) return;
  render(await response.json());
}

document.getElementById("learning-panel")?.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const profileId = target.closest("[data-profile]")?.dataset.profile;
  try {
    if (target.classList.contains("learning-accept") || target.classList.contains("learning-dismiss")) {
      const accept = target.classList.contains("learning-accept");
      const body = learningSuggestionBody({ profileId, suggestionId: target.closest("[data-suggestion]").dataset.suggestion });
      render(await post(accept ? "learningAccept" : "learningDismiss", body));
      toast(accept ? "Added to the guide. Every assistant will follow it." : "Dismissed.");
    } else if (target.classList.contains("learning-delete")) {
      render(await post("learningDelete", learningDeleteBody({ profileId, bulletId: target.closest("[data-bullet]").dataset.bullet })));
      toast("Removed from the guide.");
    } else if (target.classList.contains("learning-reset")) {
      resetFor = profileId;
      const brand = view.brands.find((b) => b.profile_id === profileId);
      document.getElementById("learning-reset-what").textContent = `${brand?.name || profileId}: clears accepted notes and suggestions. Past approvals stop counting.`;
      document.getElementById("learning-pin-row").hidden = !view.pin_required;
      document.getElementById("learning-confirm-row").hidden = view.pin_required;
      document.getElementById("learning-pin").value = "";
      document.getElementById("learning-confirm").checked = false;
      document.getElementById("learning-reset-step").hidden = false;
    } else if (target.id === "learning-reset-cancel") {
      document.getElementById("learning-reset-step").hidden = true;
      resetFor = null;
    } else if (target.id === "learning-reset-go" && resetFor) {
      const pin = document.getElementById("learning-pin").value;
      const confirm = document.getElementById("learning-confirm").checked;
      if (view.pin_required && !pin) throw new Error("Enter your owner PIN.");
      if (!view.pin_required && !confirm) throw new Error("Tick the confirm box first.");
      render(await post("learningReset", learningResetBody({ profileId: resetFor, confirm: !view.pin_required && confirm }), view.pin_required ? pin : ""));
      document.getElementById("learning-reset-step").hidden = true;
      resetFor = null;
      toast("Reset. Your assistant starts fresh for this brand.");
    }
  } catch (error) {
    toast(error.message, true);
  }
});

load().catch(() => {});
