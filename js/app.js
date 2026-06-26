/* ============================================================
 *  電気系統図 要件判定チェックツール - app.js
 *  UI Controller & Event Handling
 * ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ----------------------------------------------------------
   *  STATE
   * ---------------------------------------------------------- */
  const state = {
    apiKey: '',
    apiKeyVerified: false,
    selectedModel: 'gemini-2.5-flash',
    selectedType: null, // 'mokutekichi' | 'kiso'
    file: null,
    isExecuting: false,
    abortController: null,
    selectedPages: null, // null = default (first N pages)
  };
  const MAX_ANALYZE_PAGES = 6;

  /* ----------------------------------------------------------
   *  DOM ELEMENTS
   * ---------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const apiKeyInput = $('#apiKeyInput');
  const apiKeyToggle = $('#apiKeyToggle');
  const saveKeyCheck = $('#saveKeyCheck');
  const testApiBtn = $('#testApiBtn');
  const apiKeyStatus = $('#apiKeyStatus');
  const typeCards = $$('.type-card');
  const uploadArea = $('#uploadArea');
  const fileInput = $('#fileInput');
  const fileInfo = $('#fileInfo');
  const fileName = $('#fileName');
  const fileSize = $('#fileSize');
  const fileClear = $('#fileClear');
  const pdfPreview = $('#pdfPreview');
  const pageSelectSection = $('#pageSelectSection');
  const pageSelectGrid = $('#pageSelectGrid');
  const pageSelectCount = $('#pageSelectCount');
  const executeBtn = $('#executeBtn');
  const executeDesc = $('#executeDesc');
  const loadingSection = $('#loadingSection');
  const loadingText = $('#loadingText');
  const cancelBtn = $('#cancelBtn');
  const errorSection = $('#errorSection');
  const errorTitle = $('#errorTitle');
  const errorMessage = $('#errorMessage');
  const retryBtn = $('#retryBtn');
  const resultSection = $('#resultSection');
  const resultMeta = $('#resultMeta');
  const truncationWarning = $('#truncationWarning');
  const overallBadges = $('#overallBadges');
  const detectedGrid = $('#detectedGrid');
  const nevResults = $('#nevResults');
  const manualResults = $('#manualResults');
  const nevTabBadge = $('#nevTabBadge');
  const manualTabBadge = $('#manualTabBadge');
  const aiCommentSection = $('#aiCommentSection');
  const aiComment = $('#aiComment');
  const costSection = $('#costSection');
  const costModel = $('#costModel');
  const costInput = $('#costInput');
  const costOutput = $('#costOutput');
  const costTotal = $('#costTotal');
  const costCumulativeRow = $('#costCumulativeRow');
  const costCumulative = $('#costCumulative');
  const costLimitAlert = $('#costLimitAlert');
  const costLimitInput = $('#costLimitInput');
  const cumulativeCostLabel = $('#cumulativeCostLabel');
  const selfVerifyCheck = $('#selfVerifyCheck');
  const restoreBanner = $('#restoreBanner');
  const restoreBannerText = $('#restoreBannerText');
  const restoreBtn = $('#restoreBtn');
  const dismissRestoreBtn = $('#dismissRestoreBtn');
  const excelBtn = $('#excelBtn');
  const copyBtn = $('#copyBtn');
  const rerunBtn = $('#rerunBtn');
  const newCheckBtn = $('#newCheckBtn');
  const tabBtns = $$('.tab-btn');

  // Store last result for export
  let lastResult = null;

  const YEN_RATE = 150; // USD→JPY 概算レート（表示と累計で共通）

  /* ----------------------------------------------------------
   *  COST TRACKING (累計コスト・上限管理)
   * ---------------------------------------------------------- */
  const COST_LIMIT_KEY = 'nev_keitou_cost_limit';
  const monthKey = () => {
    const d = new Date();
    return `nev_keitou_cost_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  function getCostLimit() {
    try {
      const v = parseFloat(localStorage.getItem(COST_LIMIT_KEY) || '');
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch { return 0; }
  }
  function setCostLimit(v) {
    try {
      if (v > 0) localStorage.setItem(COST_LIMIT_KEY, String(v));
      else localStorage.removeItem(COST_LIMIT_KEY);
    } catch { /* localStorage unavailable */ }
  }
  function getCumulativeCost() {
    try {
      const v = parseFloat(localStorage.getItem(monthKey()) || '0');
      return Number.isFinite(v) && v >= 0 ? v : 0;
    } catch { return 0; }
  }
  function addCumulativeCost(jpy) {
    if (!Number.isFinite(jpy) || jpy <= 0) return getCumulativeCost();
    const next = Math.round((getCumulativeCost() + jpy) * 10) / 10;
    try { localStorage.setItem(monthKey(), String(next)); } catch { /* noop */ }
    return next;
  }
  function updateCumulativeLabel() {
    const cum = getCumulativeCost();
    const limit = getCostLimit();
    if (limit > 0) {
      cumulativeCostLabel.textContent = `今月の累計: 約${cum.toLocaleString()}円 / 上限 ${limit.toLocaleString()}円`;
      cumulativeCostLabel.className = 'cost-limit-cumulative' + (cum >= limit ? ' over' : cum >= limit * 0.8 ? ' near' : '');
    } else if (cum > 0) {
      cumulativeCostLabel.textContent = `今月の累計: 約${cum.toLocaleString()}円`;
      cumulativeCostLabel.className = 'cost-limit-cumulative';
    } else {
      cumulativeCostLabel.textContent = '';
      cumulativeCostLabel.className = 'cost-limit-cumulative';
    }
  }

  /* ----------------------------------------------------------
   *  RESULT SNAPSHOT (sessionStorage) — reload recovery
   * ---------------------------------------------------------- */
  const SNAPSHOT_KEY = 'nev_keitou_last_result';
  function saveResultSnapshot(snapshot) {
    try {
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch { /* sessionStorage full/unavailable — non-critical */ }
  }
  function loadResultSnapshot() {
    try {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      const snap = JSON.parse(raw);
      // Revive timestamp Date
      if (snap?.lastResult?.meta?.timestamp) {
        snap.lastResult.meta.timestamp = new Date(snap.lastResult.meta.timestamp);
      }
      return snap;
    } catch { return null; }
  }
  function clearResultSnapshot() {
    try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch { /* noop */ }
  }

  /* ----------------------------------------------------------
   *  INIT: Load saved API key
   * ---------------------------------------------------------- */
  try {
    const savedKey = (localStorage.getItem('nev_keitou_apikey') || '').trim();
    if (savedKey) {
      apiKeyInput.value = savedKey;
      state.apiKey = savedKey;
    }
  } catch { /* localStorage unavailable (private browsing etc.) */ }

  // Load saved cost limit
  const savedLimit = getCostLimit();
  if (savedLimit > 0) costLimitInput.value = savedLimit;
  updateCumulativeLabel();

  costLimitInput.addEventListener('input', () => {
    const v = parseFloat(costLimitInput.value);
    setCostLimit(Number.isFinite(v) && v > 0 ? v : 0);
    updateCumulativeLabel();
  });

  /* ----------------------------------------------------------
   *  API KEY HANDLING
   * ---------------------------------------------------------- */
  apiKeyInput.addEventListener('input', () => {
    state.apiKey = apiKeyInput.value.trim();
    state.apiKeyVerified = false;
    hideStatus();
    updateExecuteBtn();
  });

  apiKeyToggle.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    apiKeyToggle.innerHTML = isPassword
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  });

  testApiBtn.addEventListener('click', async () => {
    if (!state.apiKey) {
      showStatus('APIキーを入力してください。', 'error');
      return;
    }
    testApiBtn.disabled = true;
    testApiBtn.textContent = 'テスト中...';

    try {
      await DrawingChecker.testApiKey(state.apiKey);
      const modelAvailable = await DrawingChecker.checkModelAvailability(state.apiKey, state.selectedModel);
      if (!modelAvailable) {
        showStatus(`接続成功。ただし ${state.selectedModel} はこのAPIキーで利用できません。他のモデルを選択してください。`, 'error');
      } else {
        state.apiKeyVerified = true;
        showStatus(`接続成功 - ${state.selectedModel} が利用可能です。`, 'success');
        try {
          if (saveKeyCheck.checked) {
            localStorage.setItem('nev_keitou_apikey', state.apiKey);
          }
        } catch { /* quota exceeded */ }
      }
    } catch (e) {
      showStatus('接続失敗: ' + e.message, 'error');
    } finally {
      testApiBtn.disabled = false;
      testApiBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> 接続テスト';
      updateExecuteBtn();
    }
  });

  // Model selection
  $$('input[name="model"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.selectedModel = radio.value;
      state.apiKeyVerified = false;
      hideStatus();
    });
  });

  function showStatus(msg, type) {
    apiKeyStatus.textContent = msg;
    apiKeyStatus.className = 'status-message ' + type;
    apiKeyStatus.style.display = 'block';
  }
  function hideStatus() {
    apiKeyStatus.style.display = 'none';
  }

  /* ----------------------------------------------------------
   *  TYPE SELECTION
   * ---------------------------------------------------------- */
  typeCards.forEach((card) => {
    card.addEventListener('click', () => {
      typeCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      state.selectedType = card.dataset.type;
      updateExecuteBtn();
    });
  });

  /* ----------------------------------------------------------
   *  FILE UPLOAD
   * ---------------------------------------------------------- */
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });
  fileClear.addEventListener('click', clearFile);

  async function handleFile(file) {
    if (file.type !== 'application/pdf') {
      alert('PDFファイルを選択してください。');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('ファイルサイズが20MBを超えています。');
      return;
    }

    state.file = file;
    fileName.textContent = file.name;
    fileSize.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    uploadArea.style.display = 'none';
    fileInfo.style.display = 'block';

    // Preview
    try {
      const preview = await DrawingChecker.pdfToPreview(file);
      const img = document.createElement('img');
      img.src = preview;
      img.alt = 'PDF Preview';
      pdfPreview.textContent = '';
      pdfPreview.appendChild(img);
    } catch {
      pdfPreview.innerHTML = '<p style="padding:20px;color:var(--gray-500);">プレビューを生成できませんでした</p>';
    }

    // Page selection (multi-page PDFs)
    state.selectedPages = null;
    try {
      const { totalPages, thumbs, maxAnalyze } = await DrawingChecker.pdfGetPageThumbnails(file);
      buildPageSelect(totalPages, thumbs, maxAnalyze || MAX_ANALYZE_PAGES);
    } catch {
      pageSelectSection.style.display = 'none';
    }

    updateExecuteBtn();
  }

  function buildPageSelect(totalPages, thumbs, maxAnalyze) {
    pageSelectGrid.innerHTML = '';
    if (!totalPages || totalPages <= 1) {
      pageSelectSection.style.display = 'none';
      state.selectedPages = null; // single page → default
      return;
    }
    pageSelectSection.style.display = 'block';
    pageSelectCount.textContent = thumbs.length < totalPages
      ? `（全${totalPages}ページ中 先頭${thumbs.length}ページを表示）`
      : '';
    const defaultChecked = Math.min(totalPages, maxAnalyze);
    thumbs.forEach((t) => {
      const checked = t.pageNumber <= defaultChecked;
      const label = document.createElement('label');
      label.className = 'page-thumb' + (checked ? ' selected' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(t.pageNumber);
      cb.checked = checked;
      cb.addEventListener('change', () => onPageToggle(maxAnalyze));
      const img = document.createElement('img');
      img.src = t.dataUrl;
      img.alt = `${t.pageNumber}ページ目`;
      const cap = document.createElement('span');
      cap.className = 'page-thumb-cap';
      cap.textContent = `P${t.pageNumber}`;
      label.appendChild(cb);
      label.appendChild(img);
      label.appendChild(cap);
      pageSelectGrid.appendChild(label);
    });
    syncSelectedPages();
  }

  function pageCheckboxes() {
    return Array.from(pageSelectGrid.querySelectorAll('input[type="checkbox"]'));
  }
  function onPageToggle(maxAnalyze) {
    const checked = pageCheckboxes().filter((c) => c.checked);
    if (checked.length > maxAnalyze) {
      // Revert: too many selected
      alert(`解析できるのは最大${maxAnalyze}ページまでです。`);
      // uncheck the last one toggled on beyond the limit — simplest: uncheck extras
      checked.slice(maxAnalyze).forEach((c) => { c.checked = false; });
    }
    syncSelectedPages();
  }
  function syncSelectedPages() {
    const pages = pageCheckboxes().filter((c) => c.checked).map((c) => parseInt(c.value, 10));
    pageCheckboxes().forEach((c) => {
      c.closest('.page-thumb')?.classList.toggle('selected', c.checked);
    });
    state.selectedPages = pages.length ? pages : null;
    updateExecuteBtn();
  }

  function clearFile() {
    state.file = null;
    state.selectedPages = null;
    fileInput.value = '';
    uploadArea.style.display = '';
    fileInfo.style.display = 'none';
    pdfPreview.innerHTML = '';
    if (pageSelectSection) pageSelectSection.style.display = 'none';
    if (pageSelectGrid) pageSelectGrid.innerHTML = '';
    updateExecuteBtn();
  }

  /* ----------------------------------------------------------
   *  EXECUTE BUTTON STATE
   * ---------------------------------------------------------- */
  function updateExecuteBtn() {
    const ready = state.apiKey && state.selectedType && state.file && !state.isExecuting;
    executeBtn.disabled = !ready;

    const parts = [];
    if (!state.apiKey) parts.push('APIキー');
    if (!state.selectedType) parts.push('図面種別');
    if (!state.file) parts.push('PDF');

    if (parts.length > 0) {
      executeDesc.textContent = `${parts.join('、')}を設定してください。`;
    } else {
      executeDesc.textContent = '準備完了です。チェックを実行してください。';
    }
  }

  /* ----------------------------------------------------------
   *  EXECUTE CHECK
   * ---------------------------------------------------------- */
  executeBtn.addEventListener('click', runCheck);
  retryBtn.addEventListener('click', runCheck);

  async function runCheck() {
    if (!state.apiKey || !state.selectedType || !state.file) {
      showError(new Error('APIキー、図面種別、PDFファイルを全て設定してください。'));
      return;
    }
    if (state.isExecuting) return;

    state.isExecuting = true;
    executeBtn.disabled = true;
    retryBtn.disabled = true;

    // Abort controller for cancellation
    const abortController = new AbortController();
    state.abortController = abortController;

    // Snapshot state at execution start to avoid mid-run mutation
    const runState = {
      apiKey: state.apiKey,
      selectedType: state.selectedType,
      selectedModel: state.selectedModel,
      file: state.file,
      fileName: state.file.name,
      selfVerify: !!(selfVerifyCheck && selfVerifyCheck.checked),
      selectedPages: state.selectedPages ? [...state.selectedPages] : null,
    };

    // Clear previous result so stale data isn't exported on failure
    lastResult = null;

    // Hide previous results
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    loadingSection.style.display = 'block';
    loadingText.textContent = 'PDFを画像に変換中...';

    try {
      // 1. PDF to images (only selected pages, if any)
      const { images, totalPages, renderedPages } = await DrawingChecker.pdfToImages(runState.file, runState.selectedPages);
      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      loadingText.textContent = `Gemini APIで解析中... (${renderedPages}/${totalPages}ページ)`;

      // 2. Call Gemini (with cancellation + transient-error retry)
      const callOpts = {
        signal: abortController.signal,
        onRetry: (n, max) => {
          loadingText.textContent = `通信エラーのため再試行中... (${n}/${max})`;
        },
      };
      const run1 = await DrawingChecker.callGemini(
        runState.apiKey, images, runState.selectedType, runState.selectedModel, callOpts
      );
      let result = run1.result;
      let usage = run1.usage;
      let truncated = run1.truncated;

      // Self-verify mode: run a second pass and reconcile disagreements to 要確認
      if (runState.selfVerify) {
        if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        loadingText.textContent = '自己検証のため2回目を解析中...';
        const run2 = await DrawingChecker.callGemini(
          runState.apiKey, images, runState.selectedType, runState.selectedModel, callOpts
        );
        result = reconcileResults(run1.result, run2.result);
        usage = {
          promptTokens: (run1.usage?.promptTokens || 0) + (run2.usage?.promptTokens || 0),
          completionTokens: (run1.usage?.completionTokens || 0) + (run2.usage?.completionTokens || 0),
        };
        truncated = run1.truncated || run2.truncated;
      }

      if (!result) throw new Error('APIから空の結果が返されました。');

      // 3. Aggregate results
      const checkItems = DrawingChecker.getCheckItems(runState.selectedType);
      const allNevChecks = [...checkItems.nevCommon, ...checkItems.nevConditional];
      const nevAgg = DrawingChecker.aggregateResults(result.nev_results || {}, allNevChecks);
      const manualAgg = DrawingChecker.aggregateResults(result.manual_results || {}, checkItems.manual);

      // 3b. Deterministic cross-check (conservatively escalate pass/na → 要確認)
      try {
        DrawingChecker.applyDeterministicChecks(runState.selectedType, result.detected_info, nevAgg, manualAgg);
      } catch (e) { console.warn('Deterministic check skipped:', e); }

      // 4. Cost
      const cost = DrawingChecker.estimateCost(usage, runState.selectedModel);

      // Track cumulative cost for the month (real runs only)
      const runUsd = parseFloat(cost.totalCost);
      if (Number.isFinite(runUsd) && runUsd > 0) {
        addCumulativeCost(Math.round(runUsd * YEN_RATE * 10) / 10);
      }
      updateCumulativeLabel();

      // 5. Build meta (filename / timestamp)
      const meta = { fileName: runState.fileName, timestamp: new Date(), truncated: !!truncated };

      // 6. Render
      loadingSection.style.display = 'none';
      renderResults(result, nevAgg, manualAgg, cost, usage, runState.selectedModel, meta);

      // Store for export (with safe defaults to prevent crash on missing fields)
      lastResult = {
        type: runState.selectedType,
        detected: result.detected_info || {},
        nevAgg,
        manualAgg,
        aiComment: typeof result.ai_comment === 'string' ? result.ai_comment : '',
        meta,
      };

      // Persist a snapshot to sessionStorage so accidental reloads can recover it
      saveResultSnapshot({ lastResult, cost, usage, modelId: runState.selectedModel });

    } catch (e) {
      loadingSection.style.display = 'none';
      if (e?.name === 'AbortError') {
        // User cancelled — return to a clean state without an error banner
        // (results stay hidden; nothing to show)
      } else if (e instanceof TypeError && e.message.includes('fetch')) {
        showError(new Error('ネットワーク接続を確認してください。インターネットに接続されていない可能性があります。'));
      } else {
        showError(e);
      }
    } finally {
      state.isExecuting = false;
      state.abortController = null;
      retryBtn.disabled = false;
      updateExecuteBtn();
    }
  }

  // Cancel in-flight request
  cancelBtn.addEventListener('click', () => {
    if (state.abortController) {
      state.abortController.abort();
    }
    loadingSection.style.display = 'none';
  });

  // Re-run on the same PDF (respects current model selection)
  rerunBtn.addEventListener('click', () => {
    if (state.isExecuting) return;
    runCheck();
  });

  function showError(error) {
    errorSection.style.display = 'block';
    if (error.message.startsWith('API_QUOTA_EXCEEDED')) {
      const isPro = error.message.includes('2.5-pro');
      errorTitle.textContent = 'APIクォータ超過';
      errorMessage.textContent = isPro
        ? 'Gemini 2.5 Pro は有料プランのAPIキーが必要です。無料APIキーをご利用の場合は、Flashモデルを選択してください。'
        : 'Gemini APIの利用制限に達しました。しばらく待ってから再試行するか、有料プランにアップグレードしてください。';
    } else if (error.message === 'JSON_PARSE_ERROR') {
      errorTitle.textContent = '応答解析エラー';
      errorMessage.textContent = 'AIの応答をJSON形式で解析できませんでした。再試行してください。';
    } else {
      errorTitle.textContent = 'エラーが発生しました';
      errorMessage.textContent = error.message;
    }
  }

  /* ----------------------------------------------------------
   *  RENDER RESULTS
   * ---------------------------------------------------------- */
  function renderResults(result, nevAgg, manualAgg, cost, usage, modelId, meta) {
    resultSection.style.display = 'block';

    // Result meta: filename + timestamp
    if (meta) {
      const ts = meta.timestamp instanceof Date ? meta.timestamp.toLocaleString('ja-JP') : '';
      const parts = [];
      if (meta.fileName) parts.push(`<span class="result-meta-file">📄 ${escapeHtml(meta.fileName)}</span>`);
      if (ts) parts.push(`<span class="result-meta-time">判定日時: ${escapeHtml(ts)}</span>`);
      resultMeta.innerHTML = parts.join('');
      resultMeta.style.display = parts.length ? 'flex' : 'none';
    } else {
      resultMeta.innerHTML = '';
      resultMeta.style.display = 'none';
    }

    // Truncation warning
    truncationWarning.style.display = (meta && meta.truncated) ? 'flex' : 'none';

    // Overall badges
    overallBadges.innerHTML = `
      <div class="overall-badge ${nevAgg.overall}">
        <span class="badge-label">NeV要件判定</span>
        <span class="badge-status">${statusLabel(nevAgg.overall)}</span>
        <span class="badge-counts">合格 ${nevAgg.totalPass} / 不合格 ${nevAgg.totalFail} / 要確認 ${nevAgg.totalWarn}</span>
      </div>
      <div class="overall-badge ${manualAgg.overall}">
        <span class="badge-label">作図センターマニュアル判定</span>
        <span class="badge-status">${statusLabel(manualAgg.overall)}</span>
        <span class="badge-counts">合格 ${manualAgg.totalPass} / 不合格 ${manualAgg.totalFail} / 要確認 ${manualAgg.totalWarn}</span>
      </div>
    `;

    // Detected info
    const info = result.detected_info || {};
    const chargerInfo = [info.charger_type, info.charger_maker, info.charger_model].filter(Boolean).join(' ');
    // Main breaker spec: combine type, AF, AT into a readable string
    // Strip trailing unit suffix to avoid duplication ("100AT" → "100" → "100AT")
    const stripUnit = (v, unit) => {
      if (v === null || v === undefined) return '';
      return String(v).replace(new RegExp(`\\s*${unit}\\s*$`, 'i'), '').trim();
    };
    const mainBreakerSpec = (() => {
      const parts = [];
      const type = info.main_breaker_type && String(info.main_breaker_type).trim();
      if (type) parts.push(type);
      const af = stripUnit(info.main_breaker_af, 'AF');
      const at = stripUnit(info.main_breaker_at, 'AT');
      if (af && at) parts.push(`${af}AF/${at}AT`);
      else if (at) parts.push(`${at}AT`);
      else if (af) parts.push(`${af}AF`);
      return parts.join(' ');
    })();
    detectedGrid.innerHTML = [
      detectedItem('図面名称', info.drawing_title),
      detectedItem('設置場所', info.facility_name),
      detectedItem('作成者', info.author),
      detectedItem('作成日', info.creation_date),
      detectedItem('縮尺', info.scale),
      detectedItem('配電方法', info.power_distribution),
      detectedItem('充電設備', chargerInfo),
      detectedItem('台数', info.charger_count),
      detectedItem('主幹ブレーカー', mainBreakerSpec),
      detectedItem('分岐ブレーカー容量記載', boolLabel(info.branch_breaker_complete)),
      detectedItem('デマンド制御', boolLabel(info.has_demand_control)),
      detectedItem('色分け', info.color_usage),
      detectedItem('既設充電設備', boolLabel(info.has_existing_equipment)),
    ].join('');

    // Tab badges
    nevTabBadge.textContent = statusLabel(nevAgg.overall);
    nevTabBadge.className = 'tab-badge ' + nevAgg.overall;
    manualTabBadge.textContent = statusLabel(manualAgg.overall);
    manualTabBadge.className = 'tab-badge ' + manualAgg.overall;

    // NeV results
    nevResults.innerHTML = renderCategoryResults(nevAgg, 'nev');

    // Manual results
    manualResults.innerHTML = renderCategoryResults(manualAgg, 'manual');

    // AI Comment (defensive: only render if it's a non-empty string)
    if (typeof result.ai_comment === 'string' && result.ai_comment.trim()) {
      aiCommentSection.style.display = 'block';
      aiComment.textContent = result.ai_comment.trim();
    } else {
      aiCommentSection.style.display = 'none';
    }

    // Cost
    if (cost && cost.totalCost && usage) {
      costSection.style.display = 'block';
      const modelNames = {
        'gemini-2.5-pro': 'Gemini 2.5 Pro',
        'gemini-2.5-flash': 'Gemini 2.5 Flash',
        'gemini-2.0-flash': 'Gemini 2.0 Flash',
      };
      const totalUsd = parseFloat(cost.totalCost);
      const yenEstimate = isNaN(totalUsd) ? 0 : Math.round(totalUsd * YEN_RATE * 10) / 10;
      const note = cost.pricingMatched === false ? '（料金未登録モデル: 概算は2.5-flash基準）' : '';
      costModel.textContent = (modelNames[modelId] || modelId) + note;
      costInput.textContent = `${(usage.promptTokens ?? 0).toLocaleString()} tokens（$${cost.inputCost ?? '0.0000'}）`;
      costOutput.textContent = `${(usage.completionTokens ?? 0).toLocaleString()} tokens（$${cost.outputCost ?? '0.0000'}）`;
      costTotal.textContent = `$${cost.totalCost}（約 ${yenEstimate}円）`;

      // Cumulative + limit alert
      const cum = getCumulativeCost();
      const limit = getCostLimit();
      costCumulativeRow.style.display = 'flex';
      costCumulative.textContent = limit > 0
        ? `約 ${cum.toLocaleString()}円 / 上限 ${limit.toLocaleString()}円`
        : `約 ${cum.toLocaleString()}円`;
      if (limit > 0 && cum >= limit) {
        costLimitAlert.style.display = 'block';
        costLimitAlert.className = 'cost-limit-alert over';
        const over = Math.round((cum - limit) * 10) / 10;
        costLimitAlert.textContent = `⚠ 今月の料金上限（${limit.toLocaleString()}円）を超過しています。現在 約${over.toLocaleString()}円分オーバーしています。`;
      } else if (limit > 0 && cum >= limit * 0.8) {
        costLimitAlert.style.display = 'block';
        costLimitAlert.className = 'cost-limit-alert near';
        const remain = Math.round((limit - cum) * 10) / 10;
        costLimitAlert.textContent = `⚠ 今月の料金上限に近づいています（残り 約${remain.toLocaleString()}円）。`;
      } else {
        costLimitAlert.style.display = 'none';
      }
    } else {
      costSection.style.display = 'none';
    }

    // Scroll to results
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function statusLabel(status) {
    if (status === 'pass') return '合格';
    if (status === 'fail') return '不合格';
    return '要確認';
  }

  function detectedItem(label, value) {
    // Treat null/undefined/empty/whitespace as 未検出. Allow 0/false/strings.
    let display = '未検出';
    if (value !== null && value !== undefined) {
      const s = String(value).trim();
      if (s) display = escapeHtml(s);
    }
    return `<div class="detected-item">
      <span class="detected-item-label">${escapeHtml(label)}</span>
      <span class="detected-item-value">${display}</span>
    </div>`;
  }

  function renderCategoryResults(agg, group) {
    const cats = Object.entries(agg?.categories || {})
      .filter(([key]) => DrawingChecker.CATEGORIES[key]?.group === group)
      .sort(([a], [b]) => (DrawingChecker.CATEGORIES[a]?.sort || 99) - (DrawingChecker.CATEGORIES[b]?.sort || 99));

    return cats.map(([catKey, cat]) => {
      const meta = DrawingChecker.CATEGORIES[catKey];
      if (!meta) return '';

      const summaryParts = [];
      if (cat.pass > 0) summaryParts.push(`<span class="cat-pass">${cat.pass} 合格</span>`);
      if (cat.fail > 0) summaryParts.push(`<span class="cat-fail">${cat.fail} 不合格</span>`);
      if (cat.warn > 0) summaryParts.push(`<span class="cat-warn">${cat.warn} 要確認</span>`);

      const itemsHtml = (cat.items || []).map((item) => {
        const icon = statusIcon(item.status);
        const condHtml = item.condition
          ? `<span class="check-condition">${escapeHtml(item.condition)}</span>`
          : '';
        return `<div class="check-item">
          <span class="check-status ${item.status}">${icon}</span>
          <div class="check-body">
            <div class="check-label">${escapeHtml(item.label)}</div>
            <div class="check-finding">${escapeHtml(item.finding || '')}</div>
            ${condHtml}
          </div>
        </div>`;
      }).join('');

      // Default: open if any fail/warn
      const hasIssue = cat.fail > 0 || cat.warn > 0;
      const openClass = hasIssue ? 'open' : '';
      const collapsedClass = hasIssue ? '' : 'collapsed';

      return `<div class="category-group ${openClass}">
        <div class="category-header" role="button" tabindex="0" aria-expanded="${hasIssue ? 'true' : 'false'}">
          <span class="category-icon" aria-hidden="true">${meta.icon}</span>
          <span class="category-title">${escapeHtml(meta.title)}</span>
          <div class="category-summary">${summaryParts.join('')}</div>
          <svg class="category-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="category-items ${collapsedClass}">${itemsHtml}</div>
      </div>`;
    }).join('');
  }

  function statusIcon(status) {
    if (status === 'pass') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    if (status === 'fail') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    if (status === 'warn') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Self-verify: merge two AI runs. Disagreements on status → 要確認(warn).
  function reconcileResults(r1, r2) {
    const a1 = r1 || {}, a2 = r2 || {};
    const jp = (s) => s === 'pass' ? '合格' : s === 'fail' ? '不合格' : s === 'na' ? '対象外' : '要確認';
    const merged = {
      detected_info: a1.detected_info || a2.detected_info || {},
      ai_comment: (typeof a1.ai_comment === 'string' && a1.ai_comment) ? a1.ai_comment : (a2.ai_comment || ''),
      nev_results: {},
      manual_results: {},
    };
    for (const key of ['nev_results', 'manual_results']) {
      const b1 = a1[key] || {}, b2 = a2[key] || {};
      const ids = new Set([...Object.keys(b1), ...Object.keys(b2)]);
      for (const id of ids) {
        const s1 = b1[id]?.status, s2 = b2[id]?.status;
        const f1 = (b1[id]?.finding || '').toString();
        if (s1 && s2 && s1 !== s2) {
          merged[key][id] = {
            status: 'warn',
            finding: `【自己検証】2回の判定が割れました（1回目:${jp(s1)} / 2回目:${jp(s2)}）。要目視確認。${f1 ? ' AI所見: ' + f1 : ''}`,
          };
        } else {
          merged[key][id] = b1[id] || b2[id];
        }
      }
    }
    return merged;
  }

  function boolLabel(v) {
    if (v === true || v === 'true') return 'あり';
    if (v === false || v === 'false') return 'なし';
    if (v === null || v === undefined || v === '') return null; // → 未検出
    // Allow legitimate Japanese strings like "不明" / "あり" / "なし" through
    if (typeof v === 'string') return v;
    // Reject objects/arrays/functions to avoid "[object Object]"
    if (typeof v === 'object' || typeof v === 'function') return null;
    // Numbers/other primitives: stringify
    return String(v);
  }

  /* ----------------------------------------------------------
   *  CATEGORY TOGGLE (event delegation)
   * ---------------------------------------------------------- */
  function toggleCategory(header) {
    const group = header.closest('.category-group');
    if (!group) return;
    group.classList.toggle('open');
    const items = group.querySelector('.category-items');
    if (items) items.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', group.classList.contains('open') ? 'true' : 'false');
  }
  document.addEventListener('click', (e) => {
    const header = e.target.closest('.category-header');
    if (header) toggleCategory(header);
  });
  // Keyboard support for collapsible category headers
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const header = e.target.closest && e.target.closest('.category-header');
    if (!header) return;
    e.preventDefault();
    toggleCategory(header);
  });

  /* ----------------------------------------------------------
   *  TABS
   * ---------------------------------------------------------- */
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      $$('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const tabContent = $(`#tab-${btn.dataset.tab}`);
      if (tabContent) tabContent.classList.add('active');
    });
  });

  /* ----------------------------------------------------------
   *  EXCEL EXPORT, COPY & NEW CHECK
   * ---------------------------------------------------------- */
  excelBtn.addEventListener('click', () => {
    if (!lastResult) return;
    try {
      DrawingChecker.resultToExcel(
        lastResult.type, lastResult.detected, lastResult.nevAgg, lastResult.manualAgg, lastResult.aiComment, lastResult.meta
      );
    } catch (e) {
      alert('Excel出力に失敗しました: ' + e.message);
    }
  });

  let copyOrigHtml = null;
  let copyResetTimer = null;
  function showCopiedFeedback() {
    if (copyOrigHtml === null) copyOrigHtml = copyBtn.innerHTML;
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> コピーしました';
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      if (copyOrigHtml !== null) copyBtn.innerHTML = copyOrigHtml;
      copyResetTimer = null;
    }, 2000);
  }

  copyBtn.addEventListener('click', () => {
    if (!lastResult) return;
    try {
      const text = DrawingChecker.resultToText(
        lastResult.type, lastResult.detected, lastResult.nevAgg, lastResult.manualAgg, lastResult.aiComment, lastResult.meta
      );
      navigator.clipboard.writeText(text).then(showCopiedFeedback).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* noop */ }
        document.body.removeChild(ta);
        if (ok) showCopiedFeedback();
        else alert('クリップボードへのコピーに失敗しました。手動でテキストをコピーしてください。');
      });
    } catch (e) {
      alert('コピーに失敗しました: ' + e.message);
    }
  });

  newCheckBtn.addEventListener('click', () => {
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    aiCommentSection.style.display = 'none';
    costSection.style.display = 'none';
    loadingSection.style.display = 'none';
    if (truncationWarning) truncationWarning.style.display = 'none';
    if (resultMeta) { resultMeta.innerHTML = ''; resultMeta.style.display = 'none'; }
    if (restoreBanner) restoreBanner.style.display = 'none';
    hideStatus();
    lastResult = null;
    clearFile();
    typeCards.forEach((c) => c.classList.remove('active'));
    state.selectedType = null;
    // Reset tabs to NeV (find by data-attribute, not array index)
    tabBtns.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    $$('.tab-content').forEach((c) => c.classList.remove('active'));
    const nevTab = Array.from(tabBtns).find(b => b.dataset.tab === 'nev');
    if (nevTab) { nevTab.classList.add('active'); nevTab.setAttribute('aria-selected', 'true'); }
    const nevPanel = $('#tab-nev');
    if (nevPanel) nevPanel.classList.add('active');
    updateExecuteBtn();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ----------------------------------------------------------
   *  RESULT RESTORE (sessionStorage)
   * ---------------------------------------------------------- */
  function renderFromSnapshot(snap) {
    if (!snap || !snap.lastResult) return;
    const lr = snap.lastResult;
    const pseudoResult = { detected_info: lr.detected || {}, ai_comment: lr.aiComment || '' };
    renderResults(pseudoResult, lr.nevAgg, lr.manualAgg, snap.cost, snap.usage, snap.modelId, lr.meta);
    lastResult = lr;
  }

  (function initRestore() {
    const snap = loadResultSnapshot();
    if (snap && snap.lastResult) {
      const fname = snap.lastResult.meta?.fileName;
      restoreBannerText.textContent = fname
        ? `前回の判定結果（${fname}）が保存されています。`
        : '前回の判定結果が保存されています。';
      restoreBanner.style.display = 'flex';
    }
  })();

  restoreBtn.addEventListener('click', () => {
    const snap = loadResultSnapshot();
    if (snap) {
      renderFromSnapshot(snap);
      restoreBanner.style.display = 'none';
    }
  });
  dismissRestoreBtn.addEventListener('click', () => {
    clearResultSnapshot();
    restoreBanner.style.display = 'none';
  });

  /* ----------------------------------------------------------
   *  INIT
   * ---------------------------------------------------------- */
  updateExecuteBtn();
});
