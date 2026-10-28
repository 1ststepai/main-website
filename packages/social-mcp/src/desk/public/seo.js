let lastDraft = null;

function lines(value) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fillLines(id, list) {
  const node = document.getElementById(id);
  if (node) node.value = (list || []).join("\n");
}

function selectedBrand() {
  return document.getElementById("seo-brand")?.value || "";
}

function renderHelp(help) {
  const root = document.getElementById("seo-help");
  const setup = document.getElementById("seo-setup");
  if (!root || !help) return;
  root.replaceChildren();
  const count = document.createElement("p");
  count.className = "seo-count";
  count.textContent = help.headline;
  const disclaimer = document.createElement("p");
  disclaimer.className = "hint";
  disclaimer.textContent = help.disclaimer;
  const summary = document.createElement("p");
  summary.textContent = help.summary;
  const also = document.createElement("p");
  also.className = "hint";
  also.textContent = `${help.also} ${help.fourBrands}`;
  const flow = document.createElement("ol");
  for (const step of help.flow || []) {
    const li = document.createElement("li");
    li.textContent = step;
    flow.append(li);
  }
  const manual = document.createElement("ol");
  for (const step of help.manualSteps || []) {
    const li = document.createElement("li");
    li.textContent = step;
    manual.append(li);
  }
  const seo = document.createElement("ol");
  for (const step of help.seoSteps || []) {
    const li = document.createElement("li");
    li.textContent = step;
    seo.append(li);
  }
  const manualLabel = document.createElement("p");
  manualLabel.className = "hint";
  manualLabel.textContent = "By hand, for one brand and four channels, including the vidIQ lookup:";
  const seoLabel = document.createElement("p");
  seoLabel.className = "hint";
  seoLabel.textContent = "In this step, for the same work:";
  root.append(count, disclaimer, summary, also, flow, manualLabel, manual, seoLabel, seo);
  if (setup) {
    setup.replaceChildren();
    const list = document.createElement("ul");
    for (const step of help.setup || []) {
      const li = document.createElement("li");
      li.textContent = step;
      list.append(li);
    }
    setup.append(list);
  }
}

function renderBrands(profiles, keep) {
  const select = document.getElementById("seo-brand");
  if (!select) return;
  const current = keep || select.value;
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All brands";
  select.append(all);
  for (const profile of profiles || []) {
    const option = document.createElement("option");
    option.value = profile.profile_id;
    option.textContent = profile.name;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  applyBrand(profiles);
}

function applyBrand(profiles) {
  const id = selectedBrand();
  const profile = (profiles || []).find((row) => row.profile_id === id);
  if (!profile) return;
  const audience = document.getElementById("seo-audience");
  if (audience && document.activeElement !== audience) audience.value = profile.audience || "";
  if (document.activeElement?.id !== "seo-primary") fillLines("seo-primary", profile.primary);
  if (document.activeElement?.id !== "seo-secondary") fillLines("seo-secondary", profile.secondary);
  if (document.activeElement?.id !== "seo-negative") fillLines("seo-negative", profile.negative);
}

function renderSuggestions(rows) {
  const list = document.getElementById("seo-suggestions");
  if (!list) return;
  list.replaceChildren();
  for (const row of rows || []) {
    const li = document.createElement("li");
    const volume = row.volume === 0 || Number.isFinite(row.volume) ? ` · volume ${row.volume}` : "";
    li.textContent = `${row.term} · ${row.source}${volume}`;
    list.append(li);
  }
}

function renderDrafts(payload) {
  const root = document.getElementById("seo-drafts");
  const queue = document.getElementById("seo-queue");
  if (!root) return;
  root.replaceChildren();
  lastDraft = payload;
  const brands = payload?.drafts || [];
  if (queue) queue.disabled = brands.length === 0;
  for (const brand of brands) {
    const block = document.createElement("section");
    block.className = "seo-brand-block";
    const title = document.createElement("h3");
    title.textContent = brand.name || brand.profile_id;
    block.append(title);
    for (const channel of brand.channels || []) {
      const card = document.createElement("article");
      card.className = "seo-channel";
      const heading = document.createElement("h3");
      heading.textContent = channel.label || channel.platform;
      if (channel.copy_only) {
        const chip = document.createElement("span");
        chip.className = "chip copy-only";
        chip.textContent = "Copy only";
        heading.append(" ");
        heading.append(chip);
      }
      const body = document.createElement("p");
      body.textContent = `${channel.title || ""} — ${channel.caption || ""}`;
      const tags = document.createElement("p");
      tags.className = "hint";
      tags.textContent = (channel.hashtags || []).join(" ");
      card.append(heading, body, tags);
      const notes = channel.seo?.notes || [];
      if (notes.length) {
        const note = document.createElement("p");
        note.className = "seo-notes";
        note.textContent = notes.join(" ");
        card.append(note);
      }
      block.append(card);
    }
    root.append(block);
  }
}

export function initSeo({ api, showToast, refresh }) {
  let profiles = [];

  async function load() {
    const data = await api("/api/seo");
    profiles = data.profiles || [];
    renderHelp(data.help);
    renderBrands(profiles, selectedBrand());
    const planner = document.getElementById("seo-search-note");
    if (planner && data.planner && data.trends) {
      planner.textContent = "Connect search data is a separate sign-in from posting. YouTube still needs its own connection before a video can send. Keyword Planner and Google Trends stay off.";
    }
  }

  document.getElementById("seo-brand")?.addEventListener("change", () => applyBrand(profiles));

  document.getElementById("seo-save-keywords")?.addEventListener("click", async () => {
    const profileId = selectedBrand();
    if (!profileId) {
      showToast("Choose one brand to save its keywords.", true);
      return;
    }
    try {
      const data = await api("/api/seo/keywords", {
        method: "POST",
        body: JSON.stringify({
          profile_id: profileId,
          audience: document.getElementById("seo-audience")?.value || "",
          primary: lines(document.getElementById("seo-primary")?.value),
          secondary: lines(document.getElementById("seo-secondary")?.value),
          negative: lines(document.getElementById("seo-negative")?.value),
        }),
      });
      profiles = data.profiles || profiles;
      showToast(data.notes?.length ? data.notes[0] : "Keywords saved");
      await load();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("seo-suggest")?.addEventListener("click", async () => {
    try {
      const data = await api("/api/seo/suggest", {
        method: "POST",
        body: JSON.stringify({ topic: document.getElementById("seo-topic")?.value || "", profile_id: selectedBrand() || undefined }),
      });
      renderSuggestions(data.suggestions);
      showToast(data.failures?.length ? data.failures[0] : "Suggestions updated");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("seo-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("seo-draft");
    if (button) button.disabled = true;
    try {
      const profileId = selectedBrand();
      const data = await api("/api/seo/draft", {
        method: "POST",
        body: JSON.stringify({
          topic: document.getElementById("seo-topic")?.value || "",
          profile_id: profileId || undefined,
        }),
      });
      renderDrafts(data);
      showToast(data.mode === "template" ? "Starting copy is ready. Read it before you approve." : "Copy is ready.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById("seo-queue")?.addEventListener("click", async () => {
    if (!lastDraft?.drafts?.length) return;
    const button = document.getElementById("seo-queue");
    button.disabled = true;
    try {
      const score = document.getElementById("seo-vidiq-score")?.value.trim();
      const volume = document.getElementById("seo-vidiq-volume")?.value.trim();
      const competition = document.getElementById("seo-vidiq-competition")?.value.trim();
      const data = await api("/api/seo/queue", {
        method: "POST",
        body: JSON.stringify({
          topic: lastDraft.topic,
          brands: lastDraft.drafts.map((brand) => ({
            profile_id: brand.profile_id,
            name: brand.name,
            channels: (brand.channels || []).map((channel) => ({
              platform: channel.platform,
              title: channel.title,
              description: channel.description,
              caption: channel.caption,
              hashtags: channel.hashtags,
              on_screen_text: channel.on_screen_text,
              copy_only: channel.copy_only,
            })),
          })),
        }),
      });
      const queued = (data.created || []).filter((row) => row.queued && row.bundle);
      if (score || volume || competition) {
        for (const row of queued) {
          if (!row.bundle?.platforms?.includes("youtube")) continue;
          await api("/api/seo/research", {
            method: "POST",
            body: JSON.stringify({
              bundle_id: row.bundle.id,
              source: "vidiq",
              keywords: [
                {
                  term: document.getElementById("seo-topic")?.value || "",
                  volume: volume ? Number(volume) : undefined,
                  competition: competition || undefined,
                  overall: score ? Number(score) : undefined,
                  source: "vidiq",
                },
              ],
            }),
          });
        }
      }
      await refresh();
      showToast("Added to the approval queue. Nothing is approved yet.");
    } catch (error) {
      showToast(error.message, true);
      button.disabled = false;
    }
  });

  document.getElementById("seo-search-connect")?.addEventListener("click", async () => {
    const profileId = selectedBrand();
    if (!profileId) {
      showToast("Choose one brand to connect search data.", true);
      return;
    }
    try {
      const data = await api("/api/seo/search/connect", {
        method: "POST",
        body: JSON.stringify({ profile_id: profileId }),
      });
      showToast(data.message || "Sign-in opened.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("seo-search-sync")?.addEventListener("click", async () => {
    const profileId = selectedBrand();
    if (!profileId) {
      showToast("Choose one brand.", true);
      return;
    }
    try {
      const data = await api("/api/seo/search/sync", { method: "POST", body: JSON.stringify({ profile_id: profileId }) });
      showToast(data.message || "Search terms updated");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("seo-report")?.addEventListener("click", async () => {
    try {
      const data = await api("/api/seo/report");
      const body = document.getElementById("seo-report-body");
      if (body) {
        body.hidden = false;
        body.textContent = JSON.stringify(data.report, null, 2);
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });

  load().catch((error) => showToast(error.message, true));
}
