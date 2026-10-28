let examples = [];
let selected = null;
let structure = null;
let options = [];

function renderHelp(help) {
  const root = document.getElementById("hook-help");
  const setup = document.getElementById("hook-setup");
  if (!root || !help) return;
  root.replaceChildren();
  const count = document.createElement("p");
  count.className = "seo-count";
  count.textContent = help.headline;
  const disclaimer = document.createElement("p");
  disclaimer.className = "hint";
  disclaimer.textContent = help.disclaimer;
  const summary = document.createElement("p");
  summary.textContent = `${help.summary} ${help.withoutKey}`;
  const copy = document.createElement("p");
  copy.textContent = help.copyright;
  root.append(count, disclaimer, summary, copy);
  if (setup) {
    setup.replaceChildren();
    const list = document.createElement("ul");
    for (const line of help.setup || []) {
      const li = document.createElement("li");
      li.textContent = line;
      list.append(li);
    }
    setup.append(list);
  }
}

function renderVoices(voices) {
  const select = document.getElementById("hook-brand");
  const note = document.getElementById("hook-voice");
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  for (const voice of voices || []) {
    const option = document.createElement("option");
    option.value = voice.profile_id;
    option.textContent = voice.name;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  const voice = (voices || []).find((row) => row.profile_id === select.value);
  if (note && voice) {
    note.textContent = voice.todo?.length
      ? `Still to fill: ${voice.todo.join(", ")}. Blank means unknown.`
      : "Voice fields are saved.";
  }
}

function renderExamples(rows) {
  const list = document.getElementById("hook-examples");
  if (!list) return;
  list.replaceChildren();
  for (const row of rows || []) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn tiny";
    button.textContent = "Use this example";
    button.addEventListener("click", () => {
      selected = row;
      showToast(`${row.title} selected`);
    });
    const link = document.createElement("a");
    link.href = row.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = row.title;
    const math = document.createElement("p");
    math.className = "hint";
    math.textContent = `${row.format || ""} · ${row.metrics?.math || ""}`;
    li.append(link, math, button);
    list.append(li);
  }
}

function renderStructure(record) {
  const root = document.getElementById("hook-structure");
  if (!root) return;
  root.replaceChildren();
  if (!record?.structure) return;
  const card = document.createElement("article");
  card.className = "hook-card";
  const title = document.createElement("h3");
  title.textContent = record.structure.opening_type || "Opening";
  const pattern = document.createElement("p");
  pattern.textContent = record.structure.pattern || "";
  const link = document.createElement("a");
  link.href = record.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Structure borrowed from this video";
  card.append(title, pattern, link);
  root.append(card);
}

function renderOptions(hooks) {
  const root = document.getElementById("hook-options");
  if (!root) return;
  root.replaceChildren();
  options = hooks || [];
  options.forEach((hook, index) => {
    const card = document.createElement("article");
    card.className = "hook-card";
    const title = document.createElement("h3");
    title.textContent = `Hook ${index + 1}`;
    const spoken = document.createElement("p");
    spoken.textContent = hook.spoken || "";
    const shot = document.createElement("p");
    shot.className = "hint";
    shot.textContent = hook.shot || "";
    const why = document.createElement("p");
    why.className = "hint";
    why.textContent = hook.why || "";
    const use = document.createElement("button");
    use.type = "button";
    use.className = "btn primary";
    use.textContent = "Use this hook";
    use.addEventListener("click", () => useHook(index + 1));
    card.append(title, spoken, shot, why, use);
    root.append(card);
  });
}

function refreshDrafts(queue) {
  const select = document.getElementById("hook-draft");
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No waiting draft";
  select.append(empty);
  for (const item of queue || []) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.profile_name || item.profile_id}: ${item.title || "Draft"}`;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

async function useHook(pick) {
  const draftId = document.getElementById("hook-draft")?.value;
  if (!draftId) {
    showToast("Save a draft in the queue first, then pick it here.", true);
    return;
  }
  try {
    const data = await api("/api/hook/generate", {
      method: "POST",
      body: JSON.stringify({
        profile_id: document.getElementById("hook-brand")?.value,
        topic: document.getElementById("hook-topic")?.value || document.getElementById("seo-topic")?.value,
        video_id: selected?.video_id || structure?.video_id,
        title: selected?.title,
        source_description: selected?.description,
        hooks: options,
        draft_id: draftId,
        pick,
      }),
    });
    await refresh();
    showToast(data.message || "Hook attached. Nothing is approved.");
  } catch (error) {
    showToast(error.message, true);
  }
}

let showToast = () => {};
let api = async () => ({});
let refresh = async () => ({});

export function initHook(tools) {
  api = tools.api;
  showToast = tools.showToast;
  refresh = tools.refresh;

  async function load() {
    const data = await api("/api/hook/help");
    renderHelp(data.help);
    renderVoices(data.voices);
    const status = await api("/api/status");
    refreshDrafts(status.queue);
  }

  document.getElementById("hook-find")?.addEventListener("click", async () => {
    try {
      const topic = document.getElementById("hook-topic")?.value || document.getElementById("seo-topic")?.value || "";
      const data = await api("/api/hook/find", {
        method: "POST",
        body: JSON.stringify({
          topic,
          profile_id: document.getElementById("hook-brand")?.value,
          format: "any",
        }),
      });
      examples = data.examples || [];
      renderExamples(examples);
      showToast(data.message || (examples.length ? "Examples loaded." : "No examples."));
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("hook-read")?.addEventListener("click", async () => {
    if (!selected) {
      showToast("Choose an example first.", true);
      return;
    }
    try {
      const data = await api("/api/hook/capture", {
        method: "POST",
        body: JSON.stringify({
          video_id: selected.video_id,
          url: selected.url,
          title: selected.title,
          metrics: selected.metrics,
        }),
      });
      if (!data.available) {
        showToast(data.message || "Paste what you saw, then save the observation.", true);
        return;
      }
      structure = data.structure;
      renderStructure(structure);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("hook-save-observation")?.addEventListener("click", async () => {
    if (!selected) {
      showToast("Choose an example first.", true);
      return;
    }
    const text = document.getElementById("hook-observation")?.value || "";
    try {
      const data = await api("/api/hook/capture", {
        method: "POST",
        body: JSON.stringify({
          video_id: selected.video_id,
          title: selected.title,
          metrics: selected.metrics,
          observation: { opening_type: "other", pattern: text.slice(0, 240), promise: text.slice(0, 200) },
        }),
      });
      structure = data.structure;
      renderStructure(structure);
      showToast("Observation saved. No transcript was stored.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("hook-write")?.addEventListener("click", async () => {
    try {
      const data = await api("/api/hook/generate", {
        method: "POST",
        body: JSON.stringify({
          profile_id: document.getElementById("hook-brand")?.value,
          topic: document.getElementById("hook-topic")?.value || document.getElementById("seo-topic")?.value,
          video_id: structure?.video_id || selected?.video_id,
          title: selected?.title,
          source_description: selected?.description,
        }),
      });
      renderOptions(data.hooks);
      showToast(data.message || "Openings ready.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  load().catch((error) => showToast(error.message, true));
}
