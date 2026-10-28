let selectedGoal = "";

async function pilotApi(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || "Request failed");
  return data;
}

function button(className, label, attrs = {}) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  for (const [key, value] of Object.entries(attrs)) node.dataset[key] = value;
  return node;
}

function target(node) {
  return node.dataset.kind === "post" ? { post_id: node.dataset.bundle } : { bundle_id: node.dataset.bundle };
}

function renderGoals(pilot) {
  const host = document.getElementById("pilot-goals");
  host.replaceChildren();
  for (const goal of pilot.goals || []) {
    const node = button(goal.id === selectedGoal ? "btn primary" : "btn secondary", goal.label, { goal: goal.id });
    node.classList.add("pilot-goal");
    host.append(node);
  }
}

function renderTopics(pilot) {
  const host = document.getElementById("pilot-topics");
  const goal = (pilot.goals || []).find((item) => item.id === selectedGoal);
  host.replaceChildren();
  if (!goal) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const heading = document.createElement("p");
  heading.className = "hint";
  heading.textContent = goal.call_to_action || "";
  host.append(heading);
  for (const topic of goal.topics || []) {
    const node = button("btn tiny pilot-topic", topic.title, { goal: goal.id, topic: topic.id });
    host.append(node);
  }
}

function renderQueue(pilot) {
  const list = document.getElementById("pilot-queue");
  const empty = document.getElementById("pilot-empty");
  list.replaceChildren();
  const rows = pilot.queue || [];
  if (empty) empty.hidden = rows.length > 0;
  for (const item of rows) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = item.title || "Draft";
    const state = document.createElement("span");
    state.className = "chip";
    state.textContent = item.queue_label || item.status;
    const banner = document.createElement("p");
    banner.className = "compliance-banner";
    banner.textContent = item.compliance_banner || pilot.compliance_banner || "";
    li.append(title, state);
    if (item.source && item.source !== "topic") {
      const from = document.createElement("span");
      from.className = "chip";
      from.textContent = item.source === "cli" ? "From the command line" : item.source === "mcp" ? "From your AI assistant" : "Added outside the topic picker";
      li.append(from);
    }
    li.append(banner);
    if (item.change_request) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = `Changes requested: ${item.change_request}`;
      li.append(note);
    }
    for (const network of item.networks || []) {
      const block = document.createElement("label");
      block.className = "field";
      const name = document.createElement("span");
      name.textContent = `${network.label || network.platform}${network.edited ? " (edited)" : ""}`;
      const input = document.createElement("textarea");
      input.rows = network.platform === "youtube" ? 8 : 5;
      input.maxLength = 2200;
      input.value = network.caption || "";
      input.dataset.bundle = item.id;
      input.dataset.kind = item.kind || "bundle";
      input.dataset.platform = network.platform;
      block.append(name, input);
      const save = button("btn tiny pilot-save", "Save edit", { bundle: item.id, kind: item.kind || "bundle", platform: network.platform });
      li.append(block, save);
    }
    const actions = document.createElement("div");
    actions.className = "queue-actions";
    if (item.status !== "approved") {
      actions.append(button("btn primary pilot-approve", "Approve", { bundle: item.id, kind: item.kind || "bundle" }));
    }
    actions.append(button("btn secondary pilot-changes", "Request changes", { bundle: item.id, kind: item.kind || "bundle" }));
    if (item.can_regenerate !== false) {
      const edited = (item.networks || []).filter((network) => network.edited).map((network) => network.label || network.platform);
      actions.append(button("btn tiny pilot-regenerate", "Regenerate", { bundle: item.id, edited: edited.join(", ") }));
    }
    li.append(actions);
    list.append(li);
  }
}

export function renderPilot(data) {
  const root = document.getElementById("pilot-app");
  if (!data?.pilot_mode || !root) {
    document.body.classList.remove("pilot-mode");
    if (root) root.hidden = true;
    return false;
  }
  document.body.classList.add("pilot-mode");
  if (!document.body.dataset.pilotStripped) {
    for (const node of document.querySelectorAll(".owner-surface")) node.remove();
    document.body.dataset.pilotStripped = "1";
  }
  root.hidden = false;
  const pilot = data.pilot || {};
  const campaign = document.getElementById("pilot-campaign");
  if (campaign) {
    campaign.textContent = [pilot.campaign?.name, pilot.campaign_label, pilot.niche].filter(Boolean).join(" · ");
  }
  const compliance = document.getElementById("pilot-compliance");
  if (compliance) compliance.textContent = pilot.compliance_banner || "";
  const ffmpeg = document.getElementById("pilot-ffmpeg");
  if (ffmpeg) {
    ffmpeg.hidden = pilot.ffmpeg?.ok !== false;
    ffmpeg.textContent = pilot.ffmpeg?.message || "";
  }
  if (!selectedGoal && pilot.goals?.[0]) selectedGoal = pilot.goals[0].id;
  renderGoals(pilot);
  renderTopics(pilot);
  renderQueue(pilot);
  return true;
}

export function bindPilot(render) {
  const root = document.getElementById("pilot-app");
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "1";
  root.addEventListener("click", async (event) => {
    try {
    const goal = event.target.closest(".pilot-goal");
    if (goal) {
      selectedGoal = goal.dataset.goal;
      const data = await fetch("/api/status").then((res) => res.json());
      render(data);
      return;
    }
    const topic = event.target.closest(".pilot-topic");
    if (topic) {
      topic.disabled = true;
      try {
        const data = await pilotApi("/api/pilot/draft", { goal_id: topic.dataset.goal, topic_id: topic.dataset.topic });
        render(data);
      } catch (error) {
        topic.disabled = false;
        throw error;
      }
      return;
    }
    const approve = event.target.closest(".pilot-approve");
    if (approve) {
      approve.disabled = true;
      const data = await pilotApi("/api/approve", target(approve));
      render(data);
      return;
    }
    const changes = event.target.closest(".pilot-changes");
    if (changes) {
      const note = window.prompt("What should change?") || "";
      const data = await pilotApi("/api/pilot/changes", { ...target(changes), note });
      render(data);
      return;
    }
    const again = event.target.closest(".pilot-regenerate");
    if (again) {
      let replaceEdits = false;
      if (again.dataset.edited) {
        // Ask before touching edited captions. Cancel keeps them and refreshes the rest.
        replaceEdits = window.confirm(`You edited ${again.dataset.edited}. Replace those edits too? Choose Cancel to keep your edits and refresh only the other networks.`);
      }
      again.disabled = true;
      const data = await pilotApi("/api/pilot/regenerate", { bundle_id: again.dataset.bundle, replace_edits: replaceEdits });
      render(data);
      return;
    }
    const save = event.target.closest(".pilot-save");
    if (save) {
      const field = root.querySelector(`textarea[data-bundle="${save.dataset.bundle}"][data-platform="${save.dataset.platform}"]`);
      const data = await pilotApi("/api/pilot/edit", {
        ...target(save),
        platform: save.dataset.platform,
        caption: field?.value || "",
      });
      render(data);
    }
    } catch (error) {
      const note = document.getElementById("pilot-empty");
      if (note) {
        note.hidden = false;
        note.textContent = error?.message || "That step did not finish.";
      }
    }
  });
  document.getElementById("pilot-copy")?.addEventListener("click", async () => {
    const text = await fetch("/api/pilot/export.txt").then((res) => res.text());
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  });
}
