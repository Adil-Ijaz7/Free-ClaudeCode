/* ================================================================
   Free Claude Code — Admin Dashboard (OpenRouter Edition)
   ================================================================ */

const state = {
  config: null,
  fields: new Map(),
  localStatus: new Map(),
  modelOptions: [],
  activeView: "model_config",
  suggestionsVisible: false,
  selectedSuggestion: -1,
};

const MASKED_SECRET = "********";

const VIEW_GROUPS = [
  {
    id: "model_config",
    label: "Models",
    title: "Model Configuration",
    subtitle: "Configure your OpenRouter models and settings",
    icon: "⚙",
    sections: ["models", "thinking", "web_tools"],
    containerId: "modelConfigSections",
  },
  {
    id: "providers",
    label: "Providers",
    title: "Provider Settings",
    subtitle: "API keys, proxies, and connection settings",
    icon: "🔌",
    sections: ["providers", "runtime"],
    containerId: "providersSections",
  },
  {
    id: "messaging",
    label: "Messaging",
    title: "Messaging & Voice",
    subtitle: "Chat platform and voice transcription settings",
    icon: "💬",
    sections: ["messaging", "voice"],
    containerId: "messagingSections",
  },
  {
    id: "advanced",
    label: "Advanced",
    title: "Advanced & Diagnostics",
    subtitle: "Debugging flags and smoke testing endpoints",
    icon: "🛠️",
    sections: ["diagnostics", "smoke"],
    containerId: "advancedSections",
  },
];

// Section IDs for model fields that the hero card handles directly
const HERO_MODEL_KEYS = new Set(["MODEL", "MODEL_OPUS", "MODEL_SONNET", "MODEL_HAIKU"]);

const byId = (id) => document.getElementById(id);

function sourceLabel(source) {
  const labels = {
    default: "default",
    template: "template",
    repo_env: "repo .env",
    managed_env: "",
    explicit_env_file: "FCC_ENV_FILE",
    process: "process env",
  };
  return Object.prototype.hasOwnProperty.call(labels, source)
    ? labels[source]
    : source;
}

function sourceText(field) {
  const parts = [];
  const label = sourceLabel(field.source);
  if (label) parts.push(label);
  if (field.locked) parts.push("locked");
  return parts.join(" ");
}

function providerName(providerId) {
  const names = {
    open_router: "OpenRouter",
  };
  if (names[providerId]) return names[providerId];
  return providerId
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function statusClass(status) {
  if (["configured", "reachable", "running"].includes(status)) return "ok";
  if (["missing_key", "missing_url", "unknown"].includes(status)) return "warn";
  if (["offline", "error"].includes(status)) return "error";
  return "neutral";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/* ==================== Loading & Init ==================== */

async function load() {
  showMessage("Loading configuration...");
  const config = await api("/admin/api/config");
  state.config = config;
  state.fields = new Map(config.fields.map((f) => [f.key, f]));

  renderNav();
  renderProviders(config.provider_status);
  renderSections(config.sections, config.fields);
  initHeroCard(config.fields);
  byId("configPath").textContent = config.paths.managed;
  await validate(false);
  await refreshLocalStatus();
  updateDirtyState();
  checkServerStatus();
  showMessage("");

  // Auto-load models from OpenRouter in the background
  refreshModelsFromProvider();
}

function initHeroCard(fields) {
  const modelField = fields.find((f) => f.key === "MODEL");
  const opusField = fields.find((f) => f.key === "MODEL_OPUS");
  const sonnetField = fields.find((f) => f.key === "MODEL_SONNET");
  const haikuField = fields.find((f) => f.key === "MODEL_HAIKU");

  const heroInput = byId("hero-model-input");
  const opusInput = byId("tier-opus");
  const sonnetInput = byId("tier-sonnet");
  const haikuInput = byId("tier-haiku");

  if (modelField) {
    heroInput.value = modelField.value || "";
    heroInput.dataset.key = "MODEL";
    heroInput.dataset.original = modelField.value || "";
    heroInput.dataset.secret = "false";
    heroInput.dataset.configured = modelField.configured ? "true" : "false";
  }

  const tierPairs = [
    [opusField, opusInput, "MODEL_OPUS"],
    [sonnetField, sonnetInput, "MODEL_SONNET"],
    [haikuField, haikuInput, "MODEL_HAIKU"],
  ];

  tierPairs.forEach(([field, input, key]) => {
    if (field && input) {
      input.value = field.value || "";
      input.dataset.key = key;
      input.dataset.original = field.value || "";
      input.dataset.secret = "false";
      input.dataset.configured = field.configured ? "true" : "false";
    }
  });

  // Attach input listeners for dirty state
  [heroInput, opusInput, sonnetInput, haikuInput].forEach((input) => {
    if (input) {
      input.addEventListener("input", () => {
        updateDirtyState();
        if (input === heroInput) showSuggestions(input.value);
      });
      input.addEventListener("change", updateDirtyState);
      input.addEventListener("focus", () => {
        if (input === heroInput && state.modelOptions.length > 0) {
          showSuggestions(input.value);
        }
      });
    }
  });

  // Browse button opens/closes suggestions
  byId("browseModelsBtn").addEventListener("click", async () => {
    if (state.modelOptions.length === 0) {
      // Fetch models first
      byId("browseModelsBtn").disabled = true;
      try {
        await refreshModelsFromProvider();
      } finally {
        byId("browseModelsBtn").disabled = false;
      }
    }
    if (state.suggestionsVisible) {
      hideSuggestions();
    } else {
      showSuggestions("");
      heroInput.focus();
    }
  });

  // Close suggestions on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".model-input-group")) {
      hideSuggestions();
    }
  });

  // Keyboard navigation for suggestions
  heroInput.addEventListener("keydown", (e) => {
    const box = byId("modelSuggestions");
    if (box.hidden) return;

    const items = box.querySelectorAll(".suggestion-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.selectedSuggestion = Math.min(
        state.selectedSuggestion + 1,
        items.length - 1,
      );
      highlightSuggestion(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.selectedSuggestion = Math.max(state.selectedSuggestion - 1, 0);
      highlightSuggestion(items);
    } else if (e.key === "Enter" && state.selectedSuggestion >= 0) {
      e.preventDefault();
      const selected = items[state.selectedSuggestion];
      if (selected) {
        heroInput.value = selected.dataset.value;
        hideSuggestions();
        updateDirtyState();
      }
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });
}

function showSuggestions(query) {
  const box = byId("modelSuggestions");
  const q = query.toLowerCase().trim();
  
  // Sort: free models first, then alphabetical
  const sorted = [...state.modelOptions].sort((a, b) => {
    const aFree = a.includes(":free");
    const bFree = b.includes(":free");
    if (aFree && !bFree) return -1;
    if (!aFree && bFree) return 1;
    return a.localeCompare(b);
  });
  
  const matches = q
    ? sorted.filter((m) => m.toLowerCase().includes(q))
    : sorted;

  if (matches.length === 0) {
    hideSuggestions();
    return;
  }

  box.innerHTML = "";
  
  // Add header showing count
  const header = document.createElement("div");
  header.className = "suggestion-header";
  header.textContent = q
    ? `${matches.length} model${matches.length === 1 ? "" : "s"} matching "${q}"`
    : `${matches.length} models available — type to filter`;
  box.appendChild(header);
  
  const limit = Math.min(matches.length, 100);
  for (let i = 0; i < limit; i++) {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.dataset.value = matches[i];
    
    const name = document.createElement("span");
    name.className = "suggestion-name";
    name.textContent = matches[i];
    item.appendChild(name);
    
    if (matches[i].includes(":free")) {
      const badge = document.createElement("span");
      badge.className = "free-badge";
      badge.textContent = "FREE";
      item.appendChild(badge);
    }
    
    item.addEventListener("click", () => {
      byId("hero-model-input").value = matches[i];
      hideSuggestions();
      updateDirtyState();
    });
    box.appendChild(item);
  }
  
  if (matches.length > limit) {
    const more = document.createElement("div");
    more.className = "suggestion-header";
    more.textContent = `...and ${matches.length - limit} more — type to narrow results`;
    box.appendChild(more);
  }

  state.selectedSuggestion = -1;
  state.suggestionsVisible = true;
  box.hidden = false;
}

function hideSuggestions() {
  byId("modelSuggestions").hidden = true;
  state.suggestionsVisible = false;
  state.selectedSuggestion = -1;
}

function highlightSuggestion(items) {
  items.forEach((el, idx) => {
    el.classList.toggle("selected", idx === state.selectedSuggestion);
    if (idx === state.selectedSuggestion) {
      el.scrollIntoView({ block: "nearest" });
    }
  });
}

async function refreshModelsFromProvider() {
  try {
    const result = await api("/admin/api/providers/open_router/test", {
      method: "POST",
      body: "{}",
    });
    if (result.ok) {
      state.modelOptions = result.models
        .map((m) => `open_router/${m}`)
        .sort();
      showMessage(
        `Loaded ${result.models.length} models from OpenRouter`,
        "ok",
      );
    } else {
      showMessage(`Failed to fetch models: ${result.error_type}`, "error");
    }
  } catch (err) {
    showMessage(`Error fetching models: ${err.message}`, "error");
  }
}

async function checkServerStatus() {
  const el = byId("serverStatus");
  try {
    const result = await api("/admin/api/status");
    el.className = "server-status online";
    el.querySelector(".status-text").textContent = `Running — ${result.model}`;
  } catch {
    el.className = "server-status";
    el.querySelector(".status-text").textContent = "Offline";
  }
}

/* ==================== Nav ==================== */

function renderNav() {
  const nav = byId("sectionNav");
  nav.innerHTML = "";
  VIEW_GROUPS.forEach((view, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-link${index === 0 ? " active" : ""}`;
    button.dataset.view = view.id;
    button.innerHTML = `<span>${view.icon}</span> ${view.label}`;
    if (index === 0) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () =>
      setActiveView(view.id, { scroll: true }),
    );
    nav.appendChild(button);
  });
  setActiveView(state.activeView, { scroll: false });
}

function setActiveView(viewId, { scroll = false } = {}) {
  const activeView =
    VIEW_GROUPS.find((v) => v.id === viewId) || VIEW_GROUPS[0];
  state.activeView = activeView.id;
  byId("pageTitle").textContent = activeView.title;
  byId("pageSubtitle").textContent = activeView.subtitle;

  document.querySelectorAll(".nav-link").forEach((link) => {
    const selected = link.dataset.view === activeView.id;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  document.querySelectorAll(".admin-view").forEach((view) => {
    const selected = view.dataset.view === activeView.id;
    view.classList.toggle("active", selected);
    view.hidden = !selected;
  });

  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ==================== Providers ==================== */

function renderProviders(providerStatus) {
  const grid = byId("providerGrid");
  grid.innerHTML = "";
  providerStatus.forEach((provider) => {
    const card = document.createElement("article");
    card.className = "provider-card";
    card.dataset.provider = provider.provider_id;

    const title = document.createElement("div");
    title.className = "provider-title";
    title.innerHTML = `<strong>${providerName(provider.provider_id)}</strong>`;

    const pill = document.createElement("span");
    pill.className = `status-pill ${statusClass(provider.status)}`;
    pill.textContent = provider.label;
    title.appendChild(pill);

    const meta = document.createElement("div");
    meta.className = "provider-meta";
    meta.textContent =
      provider.kind === "local"
        ? provider.base_url || "No local URL configured"
        : provider.credential_env;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "test-button";
    button.textContent =
      provider.kind === "local" ? "Test" : "Refresh Models";
    button.addEventListener("click", () =>
      testProvider(provider.provider_id, button),
    );

    card.append(title, meta, button);
    grid.appendChild(card);
  });
}

function updateProviderCard(providerId, status, label, metaText) {
  const card = document.querySelector(`[data-provider="${providerId}"]`);
  if (!card) return;
  const pill = card.querySelector(".status-pill");
  pill.className = `status-pill ${statusClass(status)}`;
  pill.textContent = label;
  if (metaText) card.querySelector(".provider-meta").textContent = metaText;
}

/* ==================== Sections ==================== */

function renderSections(sections, fields) {
  VIEW_GROUPS.forEach((view) => {
    byId(view.containerId).innerHTML = "";
  });

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const bySection = new Map();
  sections.forEach((s) => bySection.set(s.id, []));
  fields.forEach((f) => {
    if (HERO_MODEL_KEYS.has(f.key)) return; // Skip — handled by hero card
    if (!bySection.has(f.section)) bySection.set(f.section, []);
    bySection.get(f.section).push(f);
  });

  VIEW_GROUPS.forEach((view) => {
    const container = byId(view.containerId);
    view.sections.forEach((sectionId) => {
      const section = sectionById.get(sectionId);
      const sectionFields = bySection.get(sectionId) || [];
      if (!section || sectionFields.length === 0) return;

      const sectionEl = document.createElement("section");
      sectionEl.className = "settings-section";
      sectionEl.id = `section-${section.id}`;

      const heading = document.createElement("div");
      heading.className = "section-heading";
      heading.innerHTML = `<div><h3>${section.label}</h3><p>${section.description}</p></div>`;
      sectionEl.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "field-grid";
      sectionFields.forEach((f) => grid.appendChild(renderField(f)));
      sectionEl.appendChild(grid);

      if (sectionFields.some((f) => f.advanced)) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "ghost-button advanced-toggle";
        toggle.textContent = "Show advanced";
        toggle.addEventListener("click", () => {
          const showing = sectionEl.classList.toggle("show-advanced");
          toggle.textContent = showing ? "Hide advanced" : "Show advanced";
        });
        sectionEl.appendChild(toggle);
      }

      container.appendChild(sectionEl);
    });
  });
}

function renderField(field) {
  const wrapper = document.createElement("div");
  wrapper.className = `field${field.advanced ? " advanced-field" : ""}`;
  wrapper.dataset.key = field.key;

  const label = document.createElement("label");
  label.htmlFor = `field-${field.key}`;
  const labelText = document.createElement("span");
  labelText.textContent = field.label;
  label.appendChild(labelText);

  const source = sourceText(field);
  if (source) {
    const sourceEl = document.createElement("span");
    sourceEl.className = "field-source";
    sourceEl.textContent = source;
    label.appendChild(sourceEl);
  }

  const input = inputForField(field);
  input.id = `field-${field.key}`;
  input.dataset.key = field.key;
  input.dataset.original = field.value || "";
  input.dataset.secret = field.secret ? "true" : "false";
  input.dataset.configured = field.configured ? "true" : "false";
  input.disabled = field.locked;
  input.addEventListener("input", updateDirtyState);
  input.addEventListener("change", updateDirtyState);

  wrapper.append(label, input);
  if (field.description) {
    const desc = document.createElement("div");
    desc.className = "field-description";
    desc.textContent = field.description;
    wrapper.appendChild(desc);
  }
  return wrapper;
}

function inputForField(field) {
  if (field.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = String(field.value).toLowerCase() === "true";
    input.dataset.original = input.checked ? "true" : "false";
    return input;
  }

  if (field.type === "tri_boolean") {
    const select = document.createElement("select");
    [
      ["", "Inherit"],
      ["true", "Enabled"],
      ["false", "Disabled"],
    ].forEach(([v, l]) => select.appendChild(option(v, l)));
    select.value = field.value || "";
    return select;
  }

  if (field.type === "select") {
    const select = document.createElement("select");
    field.options.forEach((v) => select.appendChild(option(v, v)));
    select.value = field.value || field.options[0] || "";
    return select;
  }

  if (field.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.value = field.value || "";
    return textarea;
  }

  const input = document.createElement("input");
  input.type = field.type === "number" ? "number" : "text";
  if (field.type === "secret") {
    input.type = "password";
    input.placeholder = field.configured
      ? "Configured — enter new value to replace"
      : "Not configured";
    input.value = "";
    input.autocomplete = "off";
  } else {
    input.value = field.value || "";
  }
  return input;
}

function option(value, label) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  return el;
}

/* ==================== Dirty State & Save ==================== */

function readFieldValue(input) {
  if (input.type === "checkbox") return input.checked ? "true" : "false";
  if (
    input.dataset.secret === "true" &&
    input.dataset.configured === "true"
  ) {
    return input.value ? input.value : MASKED_SECRET;
  }
  return input.value;
}

function changedValues() {
  const values = {};
  // Collect from hero card inputs
  [
    byId("hero-model-input"),
    byId("tier-opus"),
    byId("tier-sonnet"),
    byId("tier-haiku"),
  ].forEach((input) => {
    if (!input || !input.dataset.key) return;
    const value = readFieldValue(input);
    if (value !== input.dataset.original) {
      values[input.dataset.key] = value;
    }
  });

  // Collect from section fields
  document.querySelectorAll(".field-grid [data-key]").forEach((input) => {
    if (input.disabled || !input.matches("input, select, textarea")) return;
    const value = readFieldValue(input);
    if (value !== input.dataset.original) {
      values[input.dataset.key] = value;
    }
  });
  return values;
}

function updateDirtyState() {
  const count = Object.keys(changedValues()).length;
  byId("dirtyState").textContent =
    count === 0
      ? "No changes"
      : `${count} unsaved change${count === 1 ? "" : "s"}`;
  byId("applyButton").disabled = count === 0;
}

async function validate(showResult = true) {
  const result = await api("/admin/api/config/validate", {
    method: "POST",
    body: JSON.stringify({ values: changedValues() }),
  });
  if (showResult) showValidationResult(result);
  return result;
}

function showValidationResult(result) {
  if (result.valid) {
    showMessage("Configuration is valid ✓", "ok");
  } else {
    showMessage(result.errors.join("; "), "error");
  }
}

async function apply() {
  const result = await api("/admin/api/config/apply", {
    method: "POST",
    body: JSON.stringify({ values: changedValues() }),
  });
  if (!result.applied) {
    showValidationResult(result);
    return;
  }
  const restart = result.restart || {};
  if (restart.required && restart.automatic) {
    showMessage("Applied. Restarting server...", "ok");
    byId("applyButton").disabled = true;
    setTimeout(() => {
      window.location.href = restart.admin_url || "/admin";
    }, 1600);
    return;
  }
  const pending = restart.required
    ? restart.fields || []
    : result.pending_fields || [];
  await load();
  showMessage(
    pending.length
      ? `Applied. Restart fcc-server to use: ${pending.join(", ")}`
      : "Applied ✓",
    "ok",
  );
}

/* ==================== Provider Testing ==================== */

async function refreshLocalStatus() {
  const result = await api("/admin/api/providers/local-status");
  result.providers.forEach((p) => {
    state.localStatus.set(p.provider_id, p);
    const meta = p.status_code
      ? `${p.base_url} returned HTTP ${p.status_code}`
      : p.base_url;
    updateProviderCard(p.provider_id, p.status, p.label, meta);
  });
}

async function testProvider(providerId, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Testing...";
  try {
    const result = await api(`/admin/api/providers/${providerId}/test`, {
      method: "POST",
      body: "{}",
    });
    if (result.ok) {
      updateProviderCard(
        providerId,
        "reachable",
        `${result.models.length} models`,
        result.models.slice(0, 3).join(", ") || "No models returned",
      );
      state.modelOptions = Array.from(
        new Set([
          ...state.modelOptions,
          ...result.models.map((m) => `${providerId}/${m}`),
        ]),
      ).sort();
    } else {
      updateProviderCard(
        providerId,
        "offline",
        result.error_type,
        result.error_type,
      );
    }
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/* ==================== Message area ==================== */

function showMessage(message, kind = "") {
  const area = byId("messageArea");
  area.textContent = message;
  area.className = `message-area ${kind}`.trim();
}

/* ==================== Refresh models button ==================== */

byId("refreshModelsBtn")?.addEventListener("click", async () => {
  const btn = byId("refreshModelsBtn");
  btn.disabled = true;
  btn.textContent = "Refreshing...";
  try {
    await refreshModelsFromProvider();
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Refresh Models`;
  }
});

/* ==================== Wire up ==================== */

byId("validateButton").addEventListener("click", () => validate(true));
byId("applyButton").addEventListener("click", apply);

load().catch((error) => {
  showMessage(error.message, "error");
});
