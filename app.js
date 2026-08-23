(function () {
  "use strict";

  // ==================================================================
  // Fixed variable schema — categories match the spec exactly; age
  // includes 55-64, which the original list skipped.
  // ==================================================================

  const VARIABLES = {
    race: {
      label: "Race / ethnicity",
      categories: ["White", "Black", "Hispanic", "Asian American/Pacific Islander", "Native American/Alaska Native"],
      keywords: ["race", "raceethnicity", "race_ethnicity", "ethnicity", "racecat", "racecategory"],
      synonyms: {
        White: ["white", "caucasian", "whitenonhispanic", "nonhispanicwhite"],
        Black: ["black", "africanamerican", "aa", "blacknonhispanic"],
        Hispanic: ["hispanic", "latino", "latina", "latinx", "hispaniclatino"],
        "Asian American/Pacific Islander": ["asian", "aapi", "pacificislander", "asianamerican", "nhpi", "asianpacificislander"],
        "Native American/Alaska Native": ["nativeamerican", "americanindian", "alaskanative", "aian", "indigenous"],
      },
    },
    age: {
      label: "Age",
      categories: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
      keywords: ["age", "agegroup", "age_group", "agecat", "ageyears", "ageinyears", "respondentage"],
      numeric: true,
      defaultCutoffs: [25, 35, 45, 55, 65],
      // Only used if this column turns out to already be pre-binned text
      // rather than numeric ages (see the mode override in the UI) — exact
      // matches against the bracket labels themselves are handled separately
      // and don't need an entry here.
      synonyms: {
        "65+": ["65plus", "65older", "65orolder", "65andolder", "65andup", "over65", "65andabove", "65"],
      },
    },
    education: {
      label: "Education",
      categories: [
        "Less than high school",
        "High school diploma",
        "Some college/Associate's degree",
        "Bachelor's degree",
        "Graduate degree",
      ],
      keywords: ["education", "educ", "edu", "educationlevel", "educattain", "educationattainment"],
      synonyms: {
        "Less than high school": ["lessthanhighschool", "nohighschool", "somehighschool", "didnotgraduate", "lessthanhs", "8thgradeorless"],
        "High school diploma": ["highschool", "hsdiploma", "highschoolgraduate", "ged", "highschoolgrad"],
        "Some college/Associate's degree": ["somecollege", "associate", "associates", "aadegree", "twoyeardegree", "somecollegeorassociate"],
        "Bachelor's degree": ["bachelor", "bachelors", "collegegraduate", "fouryeardegree", "ba", "bs", "undergraduatedegree"],
        "Graduate degree": ["graduate", "graduatedegree", "master", "masters", "phd", "doctorate", "professionaldegree", "postgraduate", "advanceddegree"],
      },
    },
    gender: {
      label: "Gender",
      categories: ["Male", "Female", "Other"],
      keywords: ["gender", "sex", "gendercat", "respondentgender"],
      synonyms: {
        Male: ["male", "man", "m"],
        Female: ["female", "woman", "f"],
        Other: ["other", "nonbinary", "transgender", "selfdescribe", "prefernottosay", "o"],
      },
    },
    party: {
      label: "Party identification",
      categories: ["Republican", "Democrat", "Independent", "Other party"],
      keywords: ["party", "partyid", "partisanship", "pid", "partyaffiliation", "partyidentification"],
      synonyms: {
        Republican: ["republican", "rep", "gop", "r"],
        Democrat: ["democrat", "democratic", "dem", "d"],
        Independent: ["independent", "ind", "noparty", "unaffiliated", "i"],
        "Other party": ["other", "thirdparty", "libertarian", "greenparty", "o"],
      },
    },
    ideology: {
      label: "Ideology",
      categories: ["Conservative", "Moderate", "Liberal"],
      keywords: ["ideology", "ideo", "politicalideology", "ideologycat"],
      synonyms: {
        Conservative: ["conservative", "veryconservative", "somewhatconservative", "right", "c"],
        Moderate: ["moderate", "middleoftheroad", "centrist", "m"],
        Liberal: ["liberal", "veryliberal", "somewhatliberal", "left", "progressive", "l"],
      },
    },
    voteChoice: {
      label: "Vote choice (previous presidential election)",
      categories: ["Republican", "Democrat", "Other party", "Did not vote"],
      keywords: ["votechoice", "presvote", "pastvote", "votelast", "presidentialvote", "prevvote", "pastpresvote", "vote"],
      synonyms: {
        Republican: ["republican", "gop", "repcandidate", "r"],
        Democrat: ["democrat", "democratic", "demcandidate", "d"],
        "Other party": ["other", "thirdparty", "independentcandidate"],
        "Did not vote": ["didnotvote", "didntvote", "novote", "abstained", "notregistered", "didnotcastaballot"],
      },
    },
  };

  const VARIABLE_ORDER = ["race", "age", "education", "gender", "party", "ideology", "voteChoice"];

  // ==================================================================
  // Pure helpers (mirrors /test/raking-core.js, verified separately)
  // ==================================================================

  function normKey(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function round(n, d) {
    d = d === undefined ? 2 : d;
    const f = Math.pow(10, d);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  function isNumericValue(s) {
    return s !== "" && s != null && !isNaN(parseFloat(s)) && isFinite(s);
  }

  // Sorts by the value itself rather than by frequency: numeric-aware (so
  // "2" sorts before "10", not after), falls back to locale string compare
  // for non-numeric values, and always puts the blank/missing bucket last
  // regardless of how it compares as text.
  function naturalValueCompare(a, b) {
    if (a === "(blank)" && b === "(blank)") return 0;
    if (a === "(blank)") return 1;
    if (b === "(blank)") return -1;
    const aNum = isNumericValue(a);
    const bNum = isNumericValue(b);
    if (aNum && bNum) return parseFloat(a) - parseFloat(b);
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
  }

  // Multi-key version for compound crosstab rows: compares component by
  // component (so a 2-variable row sorts by the first variable, then the
  // second as a tiebreaker) rather than comparing the joined display string,
  // which would sort numeric-coded components lexicographically.
  function naturalPartsCompare(partsA, partsB) {
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
      const c = naturalValueCompare(partsA[i] == null ? "" : partsA[i], partsB[i] == null ? "" : partsB[i]);
      if (c !== 0) return c;
    }
    return 0;
  }

  function guessColumn(headers, keywords) {
    const lower = headers.map(normKey);
    for (let i = 0; i < keywords.length; i++) {
      const idx = lower.indexOf(keywords[i]);
      if (idx !== -1) return headers[idx];
    }
    for (let i = 0; i < keywords.length; i++) {
      const idx = lower.findIndex((h) => h.indexOf(keywords[i]) !== -1);
      if (idx !== -1) return headers[idx];
    }
    return null;
  }

  function suggestCategory(rawValue, categories, synonyms) {
    const key = normKey(rawValue);
    if (!key) return null;
    // A raw value that already matches a category label (e.g. a pre-binned
    // age column literally containing "18-24") always wins first, and this
    // works even for variables with no synonym dictionary at all.
    for (let i = 0; i < categories.length; i++) {
      if (normKey(categories[i]) === key) return categories[i];
    }
    if (!synonyms) return null;
    const cats = Object.keys(synonyms);
    for (let i = 0; i < cats.length; i++) {
      if (synonyms[cats[i]].indexOf(key) !== -1) return cats[i];
    }
    // Loose substring fallback below is only safe for reasonably distinctive
    // keys. A short code (e.g. "M", "C", "L") is too likely to appear as a
    // coincidental substring of an unrelated synonym — "m" inside
    // "somewhatconservative", for instance — so legitimate short codes need
    // to be listed as exact synonyms (checked just above) instead of relying
    // on this fallback.
    if (key.length < 4) return null;
    for (let i = 0; i < cats.length; i++) {
      const syns = synonyms[cats[i]];
      for (let j = 0; j < syns.length; j++) {
        if (key.indexOf(syns[j]) !== -1 || syns[j].indexOf(key) !== -1) return cats[i];
      }
    }
    return null;
  }

  function distinctValueCounts(data, col) {
    const counts = {};
    for (let i = 0; i < data.length; i++) {
      const v = data[i][col] == null ? "" : String(data[i][col]).trim();
      counts[v] = (counts[v] || 0) + 1;
    }
    return counts;
  }

  function looksNumeric(data, col) {
    let numeric = 0,
      nonEmpty = 0;
    const distinct = new Set();
    for (let i = 0; i < data.length; i++) {
      const raw = data[i][col];
      const s = raw == null ? "" : String(raw).trim();
      if (s === "") continue;
      nonEmpty++;
      distinct.add(s);
      if (s !== "" && !isNaN(parseFloat(s)) && isFinite(s)) numeric++;
    }
    if (nonEmpty === 0) return false;
    return numeric / nonEmpty > 0.9 && distinct.size > 12;
  }

  function binNumeric(num, cutoffs, labels) {
    for (let i = 0; i < cutoffs.length; i++) {
      if (num < cutoffs[i]) return labels[i];
    }
    return labels[labels.length - 1];
  }

  function makeCategoryGetter(v) {
    if (v.mode === "numeric") {
      return function (row) {
        const raw = row[v.column];
        const s = raw == null ? "" : String(raw).trim();
        if (s === "") return null;
        const num = parseFloat(s);
        if (isNaN(num)) return null;
        return binNumeric(num, v.cutoffs, v.categories);
      };
    }
    return function (row) {
      const raw = row[v.column] == null ? "" : String(row[v.column]).trim();
      const mapped = v.valueMap[raw];
      return mapped || null;
    };
  }

  function rake(rows, activeVars, opts) {
    const n = rows.length;
    let w = new Array(n).fill(1);
    const keys = Object.keys(activeVars);
    if (keys.length === 0 || n === 0) {
      return { weights: w, iterations: 0, converged: true, maxDiff: 0, trimStable: true };
    }
    const maxIter = (opts && opts.maxIter) || 50;
    const tol = (opts && opts.tol) || 0.0005;
    const trimLow = opts ? opts.trimLow : null;
    const trimHigh = opts ? opts.trimHigh : null;
    const trimOn = trimLow != null || trimHigh != null;

    const rowCat = {};
    keys.forEach(function (k) {
      rowCat[k] = rows.map(activeVars[k].getCategory);
    });

    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    let totalIterations = 0,
      maxDiff = Infinity,
      trimStable = true;
    const maxOuterRounds = trimOn ? 8 : 1;

    for (let outer = 0; outer < maxOuterRounds; outer++) {
      for (let iter = 0; iter < maxIter; iter++) {
        maxDiff = 0;
        for (let di = 0; di < keys.length; di++) {
          const k = keys[di];
          const cats = rowCat[k];
          const target = activeVars[k].targets;
          const catSum = {};
          let totalMapped = 0;
          for (let i = 0; i < n; i++) {
            const c = cats[i];
            if (c == null) continue;
            catSum[c] = (catSum[c] || 0) + w[i];
            totalMapped += w[i];
          }
          if (totalMapped <= 0) continue;
          for (let i = 0; i < n; i++) {
            const c = cats[i];
            if (c == null) continue;
            const tgtProp = target[c];
            if (tgtProp === undefined) continue;
            const curProp = catSum[c] / totalMapped;
            if (curProp <= 0) continue;
            const adj = tgtProp / curProp;
            w[i] *= adj;
            if (Math.abs(adj - 1) > maxDiff) maxDiff = Math.abs(adj - 1);
          }
          const m = mean(w);
          w = w.map((x) => x / m);
        }
        totalIterations++;
        if (maxDiff < tol) break;
      }

      if (!trimOn) break;

      let anyClamped = false;
      w = w.map((x) => {
        if (trimLow != null && x < trimLow) {
          anyClamped = true;
          return trimLow;
        }
        if (trimHigh != null && x > trimHigh) {
          anyClamped = true;
          return trimHigh;
        }
        return x;
      });
      const m2 = mean(w);
      w = w.map((x) => x / m2);
      if (!anyClamped) {
        trimStable = true;
        break;
      }
      trimStable = false;
    }

    if (trimOn) {
      const stillOut = w.some((x) => (trimLow != null && x < trimLow - 1e-9) || (trimHigh != null && x > trimHigh + 1e-9));
      if (stillOut) {
        w = w.map((x) => {
          if (trimLow != null && x < trimLow) return trimLow;
          if (trimHigh != null && x > trimHigh) return trimHigh;
          return x;
        });
      }
    }

    return { weights: w, iterations: totalIterations, converged: maxDiff < tol, maxDiff, trimStable };
  }

  function weightDiagnostics(w) {
    const n = w.length;
    if (n === 0) return null;
    const mean = w.reduce((a, b) => a + b, 0) / n;
    const min = Math.min.apply(null, w);
    const max = Math.max.apply(null, w);
    const variance = w.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    const cv2 = variance / (mean * mean);
    const deff = 1 + cv2;
    const effN = n / deff;
    return { mean, min, max, deff, effN, n };
  }

  function weightedProps(rows, getCategory, w) {
    const sums = {};
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
      const c = getCategory(rows[i]);
      if (c == null) continue;
      sums[c] = (sums[c] || 0) + w[i];
      total += w[i];
    }
    const out = {};
    Object.keys(sums).forEach((c) => (out[c] = sums[c] / total));
    return out;
  }

  function unweightedProps(rows, getCategory) {
    const counts = {};
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
      const c = getCategory(rows[i]);
      if (c == null) continue;
      counts[c] = (counts[c] || 0) + 1;
      total++;
    }
    const props = {};
    Object.keys(counts).forEach((c) => (props[c] = counts[c] / total));
    return { counts, props, total };
  }

  // ==================================================================
  // State
  // ==================================================================

  const state = {
    data: null,
    headers: [],
    fileName: "",
    vars: {},
    trim: { on: false, low: 0.3, high: 4 },
    lastWeights: null,
    lookupColumn: "",
    crosstab: { rowCols: [""], colCol: "", basis: "weighted_n" },
    columnLabels: {},
  };

  function freshVarState(key) {
    const def = VARIABLES[key];
    return {
      column: "",
      mode: def.numeric ? "numeric" : "map",
      valueMap: {},
      cutoffs: def.numeric ? def.defaultCutoffs.slice() : null,
      categories: def.categories.slice(),
      targets: {},
      enabled: false,
    };
  }

  function resetAllVarState() {
    state.vars = {};
    VARIABLE_ORDER.forEach((k) => (state.vars[k] = freshVarState(k)));
  }

  function getterFor(key) {
    return makeCategoryGetter(state.vars[key]);
  }

  function detectAndSetMode(key) {
    const def = VARIABLES[key];
    const v = state.vars[key];
    if (def.numeric && v.column) {
      v.mode = looksNumeric(state.data, v.column) ? "numeric" : "map";
    }
  }

  function autoSuggestValueMap(key) {
    const def = VARIABLES[key];
    const v = state.vars[key];
    if (!v.column) return;
    const counts = distinctValueCounts(state.data, v.column);
    const map = {};
    Object.keys(counts).forEach((raw) => {
      if (raw === "") return;
      const suggestion = suggestCategory(raw, v.categories, def.synonyms);
      if (suggestion) map[raw] = suggestion;
    });
    v.valueMap = map;
  }

  // Used when a column is freshly selected (initial load or the column
  // dropdown changing) — detects numeric-vs-categorical mode from the data,
  // then suggests value mappings. Deliberately NOT used when the user
  // manually overrides the mode (see the mode checkbox below), since
  // re-detecting there would silently revert their explicit choice.
  function autoMapColumn(key) {
    const v = state.vars[key];
    if (!v.column) return;
    detectAndSetMode(key);
    if (v.mode === "map") autoSuggestValueMap(key);
    resetTargetsToSample(key);
  }

  function resetTargetsToSample(key) {
    const v = state.vars[key];
    if (!v.column) {
      v.targets = {};
      return;
    }
    const getCat = getterFor(key);
    const up = unweightedProps(state.data, getCat);
    const targets = {};
    v.categories.forEach((cat) => {
      targets[cat] = up.props[cat] || 0;
    });
    // normalize in case of float drift
    const sum = Object.values(targets).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      Object.keys(targets).forEach((c) => (targets[c] = targets[c] / sum));
    }
    v.targets = targets;
  }

  // ---- category editing: rename/add/remove, keeping valueMap, targets,
  // and (for numeric-capable variables) cutoffs all in sync no matter
  // which editor UI triggered the change. ----

  function renameCategory(key, oldName, newName) {
    const v = state.vars[key];
    if (oldName === newName) return;
    const idx = v.categories.indexOf(oldName);
    if (idx !== -1) v.categories[idx] = newName;
    Object.keys(v.valueMap).forEach((raw) => {
      if (v.valueMap[raw] === oldName) v.valueMap[raw] = newName;
    });
    if (Object.prototype.hasOwnProperty.call(v.targets, oldName)) {
      v.targets[newName] = v.targets[oldName];
      delete v.targets[oldName];
    }
  }

  function removeCategory(key, name) {
    const v = state.vars[key];
    const def = VARIABLES[key];
    if (v.categories.length <= 2) return false; // always keep at least 2
    const idx = v.categories.indexOf(name);
    if (idx === -1) return false;
    v.categories.splice(idx, 1);
    if (def.numeric && v.cutoffs) {
      if (idx < v.cutoffs.length) v.cutoffs.splice(idx, 1);
      else if (idx > 0) v.cutoffs.splice(idx - 1, 1);
    }
    delete v.targets[name];
    Object.keys(v.valueMap).forEach((raw) => {
      if (v.valueMap[raw] === name) delete v.valueMap[raw];
    });
    return true;
  }

  function uniqueCategoryName(v, base) {
    let candidate = base;
    let suffix = 1;
    while (v.categories.indexOf(candidate) !== -1) {
      suffix++;
      candidate = base + " " + suffix;
    }
    return candidate;
  }

  // Returns the new category's name so the caller can focus its input.
  function addCategory(key) {
    const v = state.vars[key];
    const def = VARIABLES[key];
    let label;
    if (def.numeric && v.cutoffs) {
      const last = v.cutoffs.length > 0 ? v.cutoffs[v.cutoffs.length - 1] : 20;
      const newCutoff = last + 10;
      label = uniqueCategoryName(v, newCutoff + "+");
      v.cutoffs.push(newCutoff);
    } else {
      label = uniqueCategoryName(v, "New category");
    }
    v.categories.push(label);
    v.targets[label] = 0;
    return label;
  }

  function normalizedTargets(targets) {
    const sum = Object.values(targets).reduce((a, b) => a + b, 0);
    if (sum <= 0) return targets;
    const out = {};
    Object.keys(targets).forEach((c) => (out[c] = targets[c] / sum));
    return out;
  }

  function activeVariableMap() {
    const out = {};
    VARIABLE_ORDER.forEach((key) => {
      const v = state.vars[key];
      if (v.enabled && v.column && Object.keys(v.targets).length > 0) {
        out[key] = { getCategory: getterFor(key), targets: normalizedTargets(v.targets) };
      }
    });
    return out;
  }

  // ==================================================================
  // DOM refs
  // ==================================================================

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const uploadError = document.getElementById("upload-error");
  const uploadSection = document.getElementById("upload-section");
  const appSection = document.getElementById("app-section");
  const fileNameEl = document.getElementById("file-name");
  const fileMetaEl = document.getElementById("file-meta");
  const resetBtn = document.getElementById("reset-btn");
  const variablesList = document.getElementById("variables-list");
  const trimOnEl = document.getElementById("trim-on");
  const trimLowEl = document.getElementById("trim-low");
  const trimHighEl = document.getElementById("trim-high");
  const diagnosticsEl = document.getElementById("diagnostics");
  const lookupSelect = document.getElementById("lookup-select");
  const lookupLabelsEditor = document.getElementById("lookup-labels-editor");
  const lookupResults = document.getElementById("lookup-results");
  const crosstabRowList = document.getElementById("crosstab-row-list");
  const crosstabAddRowBtn = document.getElementById("crosstab-add-row");
  const crosstabColSelect = document.getElementById("crosstab-col-select");
  const crosstabBasisSelect = document.getElementById("crosstab-basis-select");
  const crosstabResults = document.getElementById("crosstab-results");

  // ==================================================================
  // Upload handling
  // ==================================================================

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--accent)";
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "";
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "";
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
  });

  function handleFile(file) {
    uploadError.hidden = true;
    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: function (res) {
        if (!res.data || res.data.length === 0) {
          showUploadError("No rows found in that file.");
          return;
        }
        const hdrs = res.meta.fields || Object.keys(res.data[0]);
        state.headers = hdrs;
        state.data = res.data;
        state.fileName = file.name;
        resetAllVarState();
        VARIABLE_ORDER.forEach((key) => {
          const guess = guessColumn(hdrs, VARIABLES[key].keywords);
          if (guess) {
            state.vars[key].column = guess;
            autoMapColumn(key);
          }
        });
        uploadSection.hidden = true;
        appSection.hidden = false;
        fileNameEl.textContent = state.fileName;
        fileMetaEl.textContent = " · " + state.data.length.toLocaleString() + " rows · " + state.headers.length + " columns";
        populateLookupSelect();
        populateCrosstabSelects();
        renderLabelsEditor();
        renderVariables();
        renderDiagnostics();
      },
      error: function (err) {
        showUploadError("Parse error: " + err.message);
      },
    });
  }

  function populateLookupSelect() {
    lookupSelect.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "— pick a column —";
    lookupSelect.appendChild(noneOpt);
    state.headers.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      lookupSelect.appendChild(opt);
    });
    lookupSelect.value = "";
    state.lookupColumn = "";
    state.columnLabels = {};
  }

  lookupSelect.addEventListener("change", () => {
    state.lookupColumn = lookupSelect.value;
    renderLabelsEditor();
    renderLookupTable();
  });

  function columnOptionsHtml() {
    let html = '<option value="">— pick a column —</option>';
    state.headers.forEach((h) => {
      html += '<option value="' + h.replace(/"/g, "&quot;") + '">' + h + "</option>";
    });
    return html;
  }

  function populateCrosstabSelects() {
    crosstabColSelect.innerHTML = columnOptionsHtml();
    crosstabColSelect.value = "";
    state.crosstab = { rowCols: [""], colCol: "", basis: "weighted_n" };
    renderCrosstabRowList();
  }

  function renderCrosstabRowList() {
    crosstabRowList.innerHTML = "";
    state.crosstab.rowCols.forEach((val, i) => {
      const item = document.createElement("div");
      item.className = "crosstab-row-item";

      const sel = document.createElement("select");
      sel.className = "var-col-select";
      sel.innerHTML = columnOptionsHtml();
      sel.value = val;
      sel.setAttribute("aria-label", "Row variable " + (i + 1));
      sel.addEventListener("change", () => {
        state.crosstab.rowCols[i] = sel.value;
        renderCrosstab();
      });
      item.appendChild(sel);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "cat-remove-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove this row variable";
      removeBtn.disabled = state.crosstab.rowCols.length <= 1;
      removeBtn.addEventListener("click", () => {
        if (state.crosstab.rowCols.length <= 1) return;
        state.crosstab.rowCols.splice(i, 1);
        renderCrosstabRowList();
        renderCrosstab();
      });
      item.appendChild(removeBtn);

      crosstabRowList.appendChild(item);
    });
  }

  crosstabAddRowBtn.addEventListener("click", () => {
    state.crosstab.rowCols.push("");
    renderCrosstabRowList();
    renderCrosstab();
  });

  crosstabColSelect.addEventListener("change", () => {
    state.crosstab.colCol = crosstabColSelect.value;
    renderCrosstab();
  });

  crosstabBasisSelect.addEventListener("change", () => {
    state.crosstab.basis = crosstabBasisSelect.value;
    renderCrosstab();
  });

  function showUploadError(msg) {
    uploadError.textContent = msg;
    uploadError.hidden = false;
  }

  resetBtn.addEventListener("click", () => {
    state.data = null;
    state.headers = [];
    state.fileName = "";
    state.lookupColumn = "";
    state.crosstab = { rowCols: [""], colCol: "", basis: "weighted_n" };
    state.columnLabels = {};
    resetAllVarState();
    fileInput.value = "";
    lookupSelect.innerHTML = '<option value="">— pick a column —</option>';
    lookupLabelsEditor.innerHTML = "";
    lookupResults.innerHTML = "";
    crosstabRowList.innerHTML = "";
    crosstabColSelect.innerHTML = '<option value="">— pick a column —</option>';
    crosstabResults.innerHTML = "";
    appSection.hidden = true;
    uploadSection.hidden = false;
  });

  // ==================================================================
  // Rendering: variable cards
  // ==================================================================

  function renderVariables() {
    variablesList.innerHTML = "";
    VARIABLE_ORDER.forEach((key) => {
      variablesList.appendChild(buildVarCard(key));
    });
  }

  function buildVarCard(key) {
    const def = VARIABLES[key];
    const v = state.vars[key];

    const card = document.createElement("div");
    card.className = "var-card";

    // ---- header ----
    const head = document.createElement("div");
    head.className = "var-head";

    const left = document.createElement("div");
    left.className = "var-head-left";

    const toggleWrap = document.createElement("label");
    toggleWrap.className = "toggle";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = v.enabled;
    toggleInput.setAttribute("aria-label", "Enable " + def.label + " for weighting");
    const toggleTrack = document.createElement("span");
    toggleTrack.className = "toggle-track";
    toggleWrap.appendChild(toggleInput);
    toggleWrap.appendChild(toggleTrack);

    const nameEl = document.createElement("span");
    nameEl.className = "var-name";
    nameEl.textContent = def.label;

    left.appendChild(toggleWrap);
    left.appendChild(nameEl);

    const colSelect = document.createElement("select");
    colSelect.className = "var-col-select";
    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "— not mapped —";
    colSelect.appendChild(noneOpt);
    state.headers.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      if (h === v.column) opt.selected = true;
      colSelect.appendChild(opt);
    });

    head.appendChild(left);
    head.appendChild(colSelect);

    // ---- body ----
    const body = document.createElement("div");
    body.className = "var-body";
    renderVarBody(body, key);

    card.appendChild(head);
    card.appendChild(body);

    toggleInput.addEventListener("change", () => {
      v.enabled = toggleInput.checked;
      renderDiagnostics();
    });

    colSelect.addEventListener("change", () => {
      v.column = colSelect.value;
      v.valueMap = {};
      v.mode = def.numeric ? "numeric" : "map";
      if (v.column) autoMapColumn(key);
      else v.targets = {};
      renderVarBody(body, key);
      renderDiagnostics();
    });

    return card;
  }

  function renderVarBody(body, key) {
    const def = VARIABLES[key];
    const v = state.vars[key];
    body.innerHTML = "";

    if (!v.column) {
      const empty = document.createElement("div");
      empty.className = "var-empty";
      empty.textContent = "Pick a column above to map this variable.";
      body.appendChild(empty);
      return;
    }

    if (def.numeric) {
      const note = document.createElement("label");
      note.className = "map-mode-note";
      note.style.display = "flex";
      note.style.alignItems = "center";
      note.style.gap = "6px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = v.mode === "map";
      cb.addEventListener("change", () => {
        v.mode = cb.checked ? "map" : "numeric";
        if (v.mode === "map") autoSuggestValueMap(key);
        resetTargetsToSample(key);
        renderVarBody(body, key);
        renderDiagnostics();
      });
      note.appendChild(cb);
      note.appendChild(document.createTextNode("This column already has category labels, not numeric ages"));
      body.appendChild(note);
    }

    if (v.mode === "numeric") {
      body.appendChild(buildBinEditor(key, body));
    } else {
      body.appendChild(buildCategoryEditor(key, body));
      body.appendChild(buildMappingTable(key, body));
    }

    if (Object.keys(v.targets).length > 0) {
      body.appendChild(buildTargetInputs(key));
    }
  }

  // Numeric-mode editor: each bracket is an editable label plus (for every
  // bracket but the last) the cutoff where the *next* bracket starts. Doubles
  // as the category editor for numeric variables — add/remove here changes
  // both the label list and the cutoff list together, so they can never
  // drift out of sync with each other.
  function buildBinEditor(key, body) {
    const v = state.vars[key];
    const wrap = document.createElement("div");

    const p = document.createElement("p");
    p.className = "map-mode-note";
    p.textContent = "Looks numeric — name each bracket and set where the next one starts. Add or remove brackets as needed.";
    wrap.appendChild(p);

    const row = document.createElement("div");
    row.className = "bin-row";

    v.categories.forEach((cat, i) => {
      const field = document.createElement("div");
      field.className = "bin-field";

      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.className = "bin-label-input";
      labelInput.value = cat;
      labelInput.setAttribute("aria-label", "Name for bracket " + (i + 1));
      labelInput.addEventListener("change", () => {
        const newName = labelInput.value.trim();
        const current = v.categories[i];
        if (!newName) {
          labelInput.value = current;
          return;
        }
        if (newName !== current && v.categories.indexOf(newName) !== -1) {
          labelInput.value = current; // duplicate name — revert
          return;
        }
        renameCategory(key, current, newName);
        renderVarBody(body, key);
        renderDiagnostics();
      });
      field.appendChild(labelInput);

      if (i < v.cutoffs.length) {
        const cutoffInput = document.createElement("input");
        cutoffInput.type = "number";
        cutoffInput.className = "bin-input";
        cutoffInput.value = v.cutoffs[i];
        cutoffInput.setAttribute("aria-label", "Starting value for the bracket after " + cat);
        cutoffInput.addEventListener("change", () => {
          const val = parseFloat(cutoffInput.value);
          if (!isNaN(val)) {
            v.cutoffs[i] = val;
            resetTargetsToSample(key);
            renderVarBody(body, key);
            renderDiagnostics();
          }
        });
        field.appendChild(cutoffInput);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "cat-remove-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove this bracket";
      removeBtn.disabled = v.categories.length <= 2;
      removeBtn.addEventListener("click", () => {
        if (removeCategory(key, cat)) {
          renderVarBody(body, key);
          renderDiagnostics();
        }
      });
      field.appendChild(removeBtn);

      row.appendChild(field);
      if (i < v.categories.length - 1) {
        const arrow = document.createElement("span");
        arrow.className = "bin-arrow";
        arrow.textContent = "→";
        row.appendChild(arrow);
      }
    });

    wrap.appendChild(row);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-ghost btn-small";
    addBtn.textContent = "+ Add bracket";
    addBtn.addEventListener("click", () => {
      addCategory(key);
      renderVarBody(body, key);
      renderDiagnostics();
      const inputs = body.querySelectorAll(".bin-label-input");
      const last = inputs[inputs.length - 1];
      if (last) {
        last.focus();
        last.select();
      }
    });
    wrap.appendChild(addBtn);

    return wrap;
  }

  // Map-mode category editor (all non-numeric variables, plus age when
  // forced into map mode): a plain editable list of category names that the
  // mapping table below reads its dropdown options from.
  function buildCategoryEditor(key, body) {
    const v = state.vars[key];
    const wrap = document.createElement("div");
    wrap.className = "cat-editor";

    const p = document.createElement("p");
    p.className = "map-mode-note";
    p.textContent = "Categories for this variable — rename, remove, or add your own to match how this poll coded it.";
    wrap.appendChild(p);

    const list = document.createElement("div");
    list.className = "cat-editor-list";

    v.categories.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "cat-editor-row";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "cat-editor-input";
      input.value = cat;
      input.setAttribute("aria-label", "Category name");
      input.addEventListener("change", () => {
        const newName = input.value.trim();
        const current = cat;
        const stillThere = v.categories.indexOf(current) !== -1;
        if (!stillThere) return; // stale row from a prior render, ignore
        if (!newName) {
          input.value = current;
          return;
        }
        if (newName !== current && v.categories.indexOf(newName) !== -1) {
          input.value = current; // duplicate — revert
          return;
        }
        renameCategory(key, current, newName);
        renderVarBody(body, key);
        renderDiagnostics();
      });
      row.appendChild(input);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "cat-remove-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove this category";
      removeBtn.disabled = v.categories.length <= 2;
      removeBtn.addEventListener("click", () => {
        if (removeCategory(key, cat)) {
          renderVarBody(body, key);
          renderDiagnostics();
        }
      });
      row.appendChild(removeBtn);

      list.appendChild(row);
    });

    wrap.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-ghost btn-small";
    addBtn.textContent = "+ Add category";
    addBtn.addEventListener("click", () => {
      addCategory(key);
      renderVarBody(body, key);
      renderDiagnostics();
      const inputs = body.querySelectorAll(".cat-editor-input");
      const last = inputs[inputs.length - 1];
      if (last) {
        last.focus();
        last.select();
      }
    });
    wrap.appendChild(addBtn);

    return wrap;
  }

  function buildMappingTable(key, body) {
    const v = state.vars[key];
    const wrap = document.createElement("div");

    const counts = distinctValueCounts(state.data, v.column);
    const rawValues = Object.keys(counts)
      .filter((r) => r !== "")
      .sort((a, b) => counts[b] - counts[a]);

    const table = document.createElement("table");
    table.className = "map-table";
    const thead = document.createElement("tr");
    ["Raw value", "N", "→", "Category"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);

    let unmappedCount = 0;

    rawValues.forEach((raw) => {
      const tr = document.createElement("tr");

      const tdRaw = document.createElement("td");
      tdRaw.className = "raw-val";
      tdRaw.textContent = raw;
      tdRaw.title = raw;

      const tdCount = document.createElement("td");
      tdCount.className = "raw-count";
      tdCount.textContent = counts[raw].toLocaleString();

      const tdArrow = document.createElement("td");
      tdArrow.textContent = "";
      tdArrow.style.color = "var(--ink-faint)";
      tdArrow.style.fontSize = "12px";

      const tdSel = document.createElement("td");
      const sel = document.createElement("select");
      sel.className = "map-select";
      const excludeOpt = document.createElement("option");
      excludeOpt.value = "";
      excludeOpt.textContent = "Exclude from weighting";
      sel.appendChild(excludeOpt);
      v.categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        if (v.valueMap[raw] === cat) opt.selected = true;
        sel.appendChild(opt);
      });
      if (!v.valueMap[raw]) {
        sel.classList.add("is-excluded");
        unmappedCount += counts[raw];
      }
      sel.addEventListener("change", () => {
        if (sel.value) v.valueMap[raw] = sel.value;
        else delete v.valueMap[raw];
        sel.classList.toggle("is-excluded", !sel.value);
        resetTargetsToSample(key);
        renderVarBody(body, key);
        renderDiagnostics();
      });
      tdSel.appendChild(sel);

      tr.appendChild(tdRaw);
      tr.appendChild(tdCount);
      tr.appendChild(tdArrow);
      tr.appendChild(tdSel);
      table.appendChild(tr);
    });

    wrap.appendChild(table);

    const note = document.createElement("div");
    note.className = "unmapped-note" + (unmappedCount > 0 ? " has-unmapped" : "");
    const total = state.data.length;
    note.textContent =
      unmappedCount > 0
        ? unmappedCount.toLocaleString() + " of " + total.toLocaleString() + " rows are excluded from this variable (unmapped)."
        : "Every raw value is mapped to a category.";
    wrap.appendChild(note);

    return wrap;
  }

  function buildTargetInputs(key) {
    const v = state.vars[key];
    const wrap = document.createElement("div");

    const getCat = getterFor(key);
    const up = unweightedProps(state.data, getCat);

    const headRow = document.createElement("div");
    headRow.className = "target-head-row";
    ["Category", "Sample", "Target"].forEach((h) => {
      const s = document.createElement("span");
      s.textContent = h;
      headRow.appendChild(s);
    });
    wrap.appendChild(headRow);

    v.categories.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "target-row";

      const nameEl = document.createElement("span");
      nameEl.className = "cat-name";
      nameEl.textContent = cat;
      if (!up.counts[cat]) {
        nameEl.title = "No respondents currently map to this category";
        nameEl.style.color = "var(--ink-faint)";
      }

      const sampleEl = document.createElement("span");
      sampleEl.className = "sample-pct";
      sampleEl.textContent = round((up.props[cat] || 0) * 100, 1) + "%";

      const input = document.createElement("input");
      input.type = "number";
      input.className = "target-input";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.value = round(v.targets[cat] || 0, 2).toFixed(2);
      input.setAttribute("aria-label", "Target proportion for " + cat);

      input.addEventListener("change", () => {
        let val = parseFloat(input.value);
        if (isNaN(val) || val < 0) val = 0;
        if (val > 1) val = 1;
        input.value = val.toFixed(2);
        v.targets[cat] = val;
        updateSumNote(wrap, key);
        renderDiagnostics();
      });

      row.appendChild(nameEl);
      row.appendChild(sampleEl);
      row.appendChild(input);
      wrap.appendChild(row);
    });

    const sumBar = document.createElement("div");
    sumBar.className = "sum-bar";

    const sumNote = document.createElement("span");
    sumNote.className = "sum-note";
    sumBar.appendChild(sumNote);

    const normBtn = document.createElement("button");
    normBtn.type = "button";
    normBtn.className = "btn btn-ghost btn-small";
    normBtn.textContent = "Normalize to 1.00";
    normBtn.title = "Rescale these boxes proportionally so they sum to 1.00";
    normBtn.addEventListener("click", () => {
      const sum = Object.values(v.targets).reduce((a, b) => a + b, 0);
      if (sum <= 0) return;
      v.categories.forEach((c) => {
        v.targets[c] = (v.targets[c] || 0) / sum;
      });
      Array.from(wrap.querySelectorAll(".target-row")).forEach((r, i) => {
        const c = v.categories[i];
        const inp = r.querySelector(".target-input");
        inp.value = round(v.targets[c], 2).toFixed(2);
      });
      updateSumNote(wrap, key);
      renderDiagnostics();
    });
    sumBar.appendChild(normBtn);

    wrap.appendChild(sumBar);
    updateSumNote(wrap, key);

    return wrap;
  }

  function updateSumNote(wrap, key) {
    const v = state.vars[key];
    const sum = Object.values(v.targets).reduce((a, b) => a + b, 0);
    const note = wrap.querySelector(".sum-note");
    note.textContent = "Targets sum to " + round(sum * 100, 1) + "%";
    note.classList.toggle("is-off", Math.abs(sum - 1) > 0.005);
  }

  // ==================================================================
  // Trimming controls
  // ==================================================================

  trimOnEl.addEventListener("change", () => {
    state.trim.on = trimOnEl.checked;
    renderDiagnostics();
  });
  trimLowEl.addEventListener("input", () => {
    state.trim.low = parseFloat(trimLowEl.value) || 0;
    renderDiagnostics();
  });
  trimHighEl.addEventListener("input", () => {
    state.trim.high = parseFloat(trimHighEl.value) || 0;
    renderDiagnostics();
  });

  // ==================================================================
  // Diagnostics + export
  // ==================================================================

  function renderDiagnostics() {
    if (!state.data) {
      diagnosticsEl.innerHTML = "";
      renderLookupTable();
      renderCrosstab();
      return;
    }
    const active = activeVariableMap();
    if (Object.keys(active).length === 0) {
      diagnosticsEl.innerHTML = '<p class="empty-diag">Turn on at least one variable above to compute weights.</p>';
      state.lastWeights = null;
      renderLookupTable();
      renderCrosstab();
      return;
    }

    const result = rake(state.data, active, {
      trimLow: state.trim.on ? state.trim.low : null,
      trimHigh: state.trim.on ? state.trim.high : null,
    });
    state.lastWeights = result.weights;
    const diag = weightDiagnostics(result.weights);

    diagnosticsEl.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "stat-grid";
    grid.appendChild(statCard("Iterations", result.iterations));
    grid.appendChild(statCard("Converged", result.converged ? "yes" : "no", !result.converged));
    grid.appendChild(statCard("Weight range", round(diag.min, 2) + " – " + round(diag.max, 2)));
    grid.appendChild(statCard("Design effect", round(diag.deff, 3), diag.deff > 2));
    grid.appendChild(statCard("Effective N", round(diag.effN, 0) + " / " + diag.n));
    if (state.trim.on) {
      grid.appendChild(statCard("Trim stable", result.trimStable ? "yes" : "no", !result.trimStable));
    }
    diagnosticsEl.appendChild(grid);

    const marginsTitle = document.createElement("h3");
    marginsTitle.className = "margins-title";
    marginsTitle.textContent = "Weighted vs. sample margins";
    diagnosticsEl.appendChild(marginsTitle);

    Object.keys(active).forEach((key) => {
      diagnosticsEl.appendChild(buildMarginsBlock(key, result.weights));
    });

    const exportBtn = document.createElement("button");
    exportBtn.className = "btn btn-primary";
    exportBtn.textContent = "Export weighted CSV";
    exportBtn.addEventListener("click", exportCsv);
    diagnosticsEl.appendChild(exportBtn);

    renderLookupTable();
    renderCrosstab();
  }

  // ==================================================================
  // Look up any column with current weights applied — including
  // columns that aren't part of the 7-variable weighting schema.
  // ==================================================================

  const LOOKUP_MAX_ROWS = 30;

  // If this column is also the source column for one of the 7 weighting
  // variables (in map mode), its existing raw-value -> category mapping is
  // a reasonable label default — no need to re-type it.
  function suggestedLabelsForColumn(col) {
    for (let i = 0; i < VARIABLE_ORDER.length; i++) {
      const v = state.vars[VARIABLE_ORDER[i]];
      if (v.column === col && v.mode === "map") return v.valueMap;
    }
    return null;
  }

  function displayLabel(col, rawValue) {
    const custom = state.columnLabels[col] && state.columnLabels[col][rawValue];
    if (custom) return custom;
    const suggested = suggestedLabelsForColumn(col);
    if (suggested && suggested[rawValue]) return suggested[rawValue];
    return rawValue;
  }

  function renderLabelsEditor() {
    lookupLabelsEditor.innerHTML = "";
    if (!state.data || !state.lookupColumn) return;
    const col = state.lookupColumn;
    const counts = distinctValueCounts(state.data, col);
    const rawValues = Object.keys(counts)
      .filter((r) => r !== "")
      .sort(naturalValueCompare);
    if (rawValues.length === 0) return;

    if (!state.columnLabels[col]) state.columnLabels[col] = {};
    const labels = state.columnLabels[col];

    const details = document.createElement("details");
    details.className = "labels-editor";
    const summary = document.createElement("summary");
    summary.textContent = "Edit labels for this column";
    details.appendChild(summary);

    const note = document.createElement("p");
    note.className = "map-mode-note";
    note.textContent = "Applies wherever this column shows up — here and in the crosstab. Leave a box as-is to keep the raw value.";
    details.appendChild(note);

    const list = document.createElement("div");
    list.className = "labels-editor-list";

    rawValues.forEach((raw) => {
      const row = document.createElement("div");
      row.className = "labels-editor-row";

      const rawSpan = document.createElement("span");
      rawSpan.className = "labels-editor-raw";
      rawSpan.textContent = raw;
      rawSpan.title = raw;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "labels-editor-input";
      input.value = displayLabel(col, raw);
      input.setAttribute("aria-label", "Label for " + raw);
      input.addEventListener("change", () => {
        const val = input.value.trim();
        if (!val || val === raw) delete labels[raw];
        else labels[raw] = val;
        renderLookupTable();
        renderCrosstab();
      });

      row.appendChild(rawSpan);
      row.appendChild(input);
      list.appendChild(row);
    });
    details.appendChild(list);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn-ghost btn-small";
    resetBtn.textContent = "Reset to raw values";
    resetBtn.addEventListener("click", () => {
      state.columnLabels[col] = {};
      renderLabelsEditor();
      renderLookupTable();
      renderCrosstab();
    });
    details.appendChild(resetBtn);

    lookupLabelsEditor.appendChild(details);
  }

  function rawColumnStats(col, weights, maxRows) {
    const counts = {};
    const wsums = {};
    let total = 0;
    let wtotal = 0;
    for (let i = 0; i < state.data.length; i++) {
      const raw = state.data[i][col];
      const s = raw == null ? "" : String(raw).trim();
      const label = s === "" ? "(blank)" : s;
      const w = weights ? weights[i] : 1;
      counts[label] = (counts[label] || 0) + 1;
      wsums[label] = (wsums[label] || 0) + w;
      total += 1;
      wtotal += w;
    }
    let rows = Object.keys(counts).map((label) => ({
      label,
      n: counts[label],
      unweightedPct: counts[label] / total,
      weightedPct: wsums[label] / wtotal,
    }));
    const distinctCount = rows.length;
    if (maxRows && rows.length > maxRows) {
      rows.sort((a, b) => b.n - a.n); // truncate to the most substantial categories first
      rows = rows.slice(0, maxRows);
    }
    rows.sort((a, b) => naturalValueCompare(a.label, b.label)); // then display in value order
    return { rows, distinctCount, total };
  }

  function renderLookupTable() {
    if (!state.data || !state.lookupColumn) {
      lookupResults.innerHTML = state.data ? '<p class="empty-diag">Pick a column above to see its distribution.</p>' : "";
      return;
    }

    const col = state.lookupColumn;
    const stats = rawColumnStats(col, state.lastWeights, LOOKUP_MAX_ROWS);

    lookupResults.innerHTML = "";

    if (!state.lastWeights) {
      const note = document.createElement("p");
      note.className = "lookup-note";
      note.textContent = "No weighting variables are turned on yet, so \u201cWeighted\u201d below just matches \u201cUnweighted.\u201d";
      lookupResults.appendChild(note);
    }

    const table = document.createElement("table");
    table.className = "lookup-table";
    const thead = document.createElement("tr");
    ["Value", "N", "Unweighted", "Weighted"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);

    stats.rows.forEach((r) => {
      const tr = document.createElement("tr");
      const cells = [
        { text: displayLabel(col, r.label), title: r.label },
        { text: r.n.toLocaleString(), title: null },
        { text: round(r.unweightedPct * 100, 1) + "%", title: null },
        { text: round(r.weightedPct * 100, 1) + "%", title: null },
      ];
      cells.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = c.text;
        td.title = c.title != null ? c.title : c.text;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    lookupResults.appendChild(table);

    if (stats.distinctCount > LOOKUP_MAX_ROWS) {
      const note = document.createElement("p");
      note.className = "lookup-note";
      note.textContent =
        "Showing the " +
        LOOKUP_MAX_ROWS +
        " most common of " +
        stats.distinctCount.toLocaleString() +
        " distinct values — this column may be closer to continuous than categorical.";
      lookupResults.appendChild(note);
    }
  }

  // ==================================================================
  // Crosstab: two or more columns at once, weighted, including columns
  // outside the 7-variable schema. Two or more row variables combine
  // into a single compound row key ("Republican | Conservative"); the
  // column dimension is always exactly one variable.
  // ==================================================================

  const CROSSTAB_MAX_DIM = 12;

  function crosstabRowParts(rowCols, row) {
    return rowCols.map((c) => {
      const raw = row[c];
      const s = raw == null ? "" : String(raw).trim();
      return s === "" ? "(blank)" : s;
    });
  }

  function crosstabStats(rowCols, colCol, weights) {
    const rowCounts = {};
    const rowTotals = {};
    const rowParts = {};
    const colTotals = {};
    let grandTotal = 0;
    for (let i = 0; i < state.data.length; i++) {
      const row = state.data[i];
      const parts = crosstabRowParts(rowCols, row);
      const rowKey = parts.join(" | ");
      const cv = row[colCol];
      const cs = cv == null ? "" : String(cv).trim();
      const colKey = cs === "" ? "(blank)" : cs;
      const w = weights ? weights[i] : 1;
      if (!rowCounts[rowKey]) rowCounts[rowKey] = {};
      if (!rowParts[rowKey]) rowParts[rowKey] = parts;
      rowCounts[rowKey][colKey] = (rowCounts[rowKey][colKey] || 0) + w;
      rowTotals[rowKey] = (rowTotals[rowKey] || 0) + w;
      colTotals[colKey] = (colTotals[colKey] || 0) + w;
      grandTotal += w;
    }
    return { rowCounts, rowTotals, rowParts, colTotals, grandTotal };
  }

  function ctFmtN(n) {
    return round(n, 1).toLocaleString();
  }
  function ctFmtPct(part, whole) {
    if (!whole || whole <= 0) return "—";
    return ((part / whole) * 100).toFixed(1) + "%";
  }
  // Body cell: percentage bases are relative to the row/column/grand total
  // that actually contains this cell.
  function ctCell(basis, value, rowTotal, colTotal, grandTotal) {
    if (basis === "weighted_n") return ctFmtN(value);
    if (basis === "row_pct") return ctFmtPct(value, rowTotal);
    if (basis === "col_pct") return ctFmtPct(value, colTotal);
    return ctFmtPct(value, grandTotal);
  }
  // Total-column cell (right edge): row% is always 100 by definition (the
  // row against itself); col%/total% have no single column to be "of", so
  // both fall back to this row's share of the grand total.
  function ctRowTotalCell(basis, rowTotal, grandTotal) {
    if (basis === "weighted_n") return ctFmtN(rowTotal);
    if (basis === "row_pct") return ctFmtPct(rowTotal, rowTotal);
    return ctFmtPct(rowTotal, grandTotal);
  }
  // Total-row cell (bottom edge): mirror image of the above.
  function ctColTotalCell(basis, colTotal, grandTotal) {
    if (basis === "weighted_n") return ctFmtN(colTotal);
    if (basis === "col_pct") return ctFmtPct(colTotal, colTotal);
    return ctFmtPct(colTotal, grandTotal);
  }
  function ctGrandTotalCell(basis, grandTotal) {
    if (basis === "weighted_n") return ctFmtN(grandTotal);
    return ctFmtPct(grandTotal, grandTotal);
  }

  function renderCrosstab() {
    const rowCols = state.crosstab.rowCols.filter((c) => c);
    const colCol = state.crosstab.colCol;
    const basis = state.crosstab.basis;

    crosstabResults.innerHTML = "";
    if (!state.data) return;

    if (rowCols.length === 0 || !colCol) {
      crosstabResults.innerHTML = '<p class="empty-diag">Pick at least one row variable and a column variable to see the crosstab.</p>';
      return;
    }

    if (!state.lastWeights) {
      const note = document.createElement("p");
      note.className = "lookup-note";
      note.textContent = "No weighting variables are turned on yet, so this crosstab is unweighted.";
      crosstabResults.appendChild(note);
    }

    const stats = crosstabStats(rowCols, colCol, state.lastWeights);

    let rowKeys = Object.keys(stats.rowTotals);
    let colKeys = Object.keys(stats.colTotals);
    const rowTruncated = rowKeys.length > CROSSTAB_MAX_DIM;
    const colTruncated = colKeys.length > CROSSTAB_MAX_DIM;
    if (rowTruncated) {
      rowKeys.sort((a, b) => stats.rowTotals[b] - stats.rowTotals[a]);
      rowKeys = rowKeys.slice(0, CROSSTAB_MAX_DIM);
    }
    if (colTruncated) {
      colKeys.sort((a, b) => stats.colTotals[b] - stats.colTotals[a]);
      colKeys = colKeys.slice(0, CROSSTAB_MAX_DIM);
    }
    rowKeys.sort((a, b) => naturalPartsCompare(stats.rowParts[a], stats.rowParts[b]));
    colKeys.sort(naturalValueCompare);

    const wrapDiv = document.createElement("div");
    wrapDiv.className = "crosstab-table-wrap";

    const table = document.createElement("table");
    table.className = "crosstab-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = rowCols.join(" \u00d7 ") + " \\ " + colCol;
    headRow.appendChild(corner);
    colKeys.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = displayLabel(colCol, c);
      th.title = c;
      headRow.appendChild(th);
    });
    const cornerTotalTh = document.createElement("th");
    cornerTotalTh.textContent = "Total";
    headRow.appendChild(cornerTotalTh);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rowKeys.forEach((r) => {
      const tr = document.createElement("tr");
      const rowTh = document.createElement("th");
      rowTh.textContent = stats.rowParts[r].map((p, idx) => displayLabel(rowCols[idx], p)).join(" | ");
      rowTh.title = r;
      rowTh.scope = "row";
      tr.appendChild(rowTh);
      colKeys.forEach((c) => {
        const cellW = (stats.rowCounts[r] && stats.rowCounts[r][c]) || 0;
        const td = document.createElement("td");
        td.textContent = ctCell(basis, cellW, stats.rowTotals[r], stats.colTotals[c], stats.grandTotal);
        tr.appendChild(td);
      });
      const rowTotalTd = document.createElement("td");
      rowTotalTd.className = "ct-total-col";
      rowTotalTd.textContent = ctRowTotalCell(basis, stats.rowTotals[r], stats.grandTotal);
      tr.appendChild(rowTotalTd);
      tbody.appendChild(tr);
    });

    const totalRow = document.createElement("tr");
    totalRow.className = "ct-total-row";
    const totalRowTh = document.createElement("th");
    totalRowTh.textContent = "Total";
    totalRow.appendChild(totalRowTh);
    colKeys.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = ctColTotalCell(basis, stats.colTotals[c], stats.grandTotal);
      totalRow.appendChild(td);
    });
    const grandTd = document.createElement("td");
    grandTd.textContent = ctGrandTotalCell(basis, stats.grandTotal);
    totalRow.appendChild(grandTd);
    tbody.appendChild(totalRow);

    table.appendChild(tbody);
    wrapDiv.appendChild(table);
    crosstabResults.appendChild(wrapDiv);

    if (rowTruncated || colTruncated) {
      const note = document.createElement("p");
      note.className = "lookup-note";
      note.textContent =
        "Showing up to the " +
        CROSSTAB_MAX_DIM +
        " largest categories per side" +
        (rowTruncated ? " (rows truncated)" : "") +
        (colTruncated ? " (columns truncated)" : "") +
        " — one of these columns may be closer to continuous than categorical.";
      crosstabResults.appendChild(note);
    }
  }

  function statCard(label, value, warn) {
    const card = document.createElement("div");
    card.className = "stat-card";
    const l = document.createElement("div");
    l.className = "stat-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "stat-value" + (warn ? " is-warn" : "");
    v.textContent = value;
    card.appendChild(l);
    card.appendChild(v);
    return card;
  }

  function buildMarginsBlock(key, weights) {
    const def = VARIABLES[key];
    const v = state.vars[key];
    const getCat = getterFor(key);
    const up = unweightedProps(state.data, getCat);
    const wp = weightedProps(state.data, getCat, weights);

    const block = document.createElement("div");
    block.className = "margins-block";

    const title = document.createElement("div");
    title.className = "margins-title";
    title.textContent = def.label;
    block.appendChild(title);

    const table = document.createElement("table");
    table.className = "margins-table";
    const thead = document.createElement("tr");
    ["Category", "Sample", "Target", "Weighted"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);

    v.categories.forEach((cat) => {
      const tr = document.createElement("tr");
      const cells = [
        cat,
        round((up.props[cat] || 0) * 100, 1) + "%",
        round((v.targets[cat] || 0) * 100, 1) + "%",
        round((wp[cat] || 0) * 100, 1) + "%",
      ];
      cells.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    block.appendChild(table);
    return block;
  }

  function exportCsv() {
    if (!state.data || !state.lastWeights) return;
    const rows = state.data.map((r, i) => {
      const o = Object.assign({}, r);
      o.weight = round(state.lastWeights[i], 4);
      return o;
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (state.fileName ? state.fileName.replace(/\.csv$/i, "") : "weighted_data") + "_weighted.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();
