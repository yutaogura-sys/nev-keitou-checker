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
  };

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
  const executeBtn = $('#executeBtn');
  const executeDesc = $('#executeDesc');
  const loadingSection = $('#loadingSection');
  const loadingText = $('#loadingText');
  const errorSection = $('#errorSection');
  const errorMessage = $('#errorMessage');
  const retryBtn = $('#retryBtn');
  const resultSection = $('#resultSection');
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
  const copyBtn = $('#copyBtn');
  const newCheckBtn = $('#newCheckBtn');
  const tabBtns = $$('.tab-btn');

  // Store last result for export
  let lastResult = null;

  /* ----------------------------------------------------------
   *  INIT: Load saved API key
   * ---------------------------------------------------------- */
  const savedKey = localStorage.getItem('nev_keitou_apikey');
  if (savedKey) {
    apiKeyInput.value = savedKey;
    state.apiKey = savedKey;
  }

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
        if (saveKeyCheck.checked) {
          localStorage.setItem('nev_keitou_apikey', state.apiKey);
        }
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
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
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
      pdfPreview.innerHTML = `<img src="${preview}" alt="PDF Preview">`;
    } catch {
      pdfPreview.innerHTML = '<p style="padding:20px;color:var(--gray-400);">プレビューを生成できませんでした</p>';
    }

    updateExecuteBtn();
  }

  function clearFile() {
    state.file = null;
    fileInput.value = '';
    uploadArea.style.display = '';
    fileInfo.style.display = 'none';
    pdfPreview.innerHTML = '';
    updateExecuteBtn();
  }

  /* ----------------------------------------------------------
   *  EXECUTE BUTTON STATE
   * ---------------------------------------------------------- */
  function updateExecuteBtn() {
    const ready = state.apiKey && state.selectedType && state.file;
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

    // Disable button during execution
    executeBtn.disabled = true;

    // Hide previous results
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    loadingSection.style.display = 'block';
    loadingText.textContent = 'PDFを画像に変換中...';

    try {
      // 1. PDF to images
      const { images, totalPages, renderedPages } = await DrawingChecker.pdfToImages(state.file);
      loadingText.textContent = `Gemini APIで解析中... (${renderedPages}/${totalPages}ページ)`;

      // 2. Call Gemini
      const { result, usage, truncated } = await DrawingChecker.callGemini(
        state.apiKey, images, state.selectedType, state.selectedModel
      );

      if (truncated) {
        console.warn('Gemini output was truncated (MAX_TOKENS)');
      }

      // 3. Aggregate results
      const checkItems = DrawingChecker.getCheckItems(state.selectedType);
      const allNevChecks = [...checkItems.nevCommon, ...checkItems.nevConditional];
      const nevAgg = DrawingChecker.aggregateResults(result.nev_results || {}, allNevChecks);
      const manualAgg = DrawingChecker.aggregateResults(result.manual_results || {}, checkItems.manual);

      // 4. Cost
      const cost = DrawingChecker.estimateCost(usage, state.selectedModel);

      // 5. Render
      loadingSection.style.display = 'none';
      renderResults(result, nevAgg, manualAgg, cost, usage, state.selectedModel);

      // Store for export
      lastResult = { type: state.selectedType, detected: result.detected_info, nevAgg, manualAgg, aiComment: result.ai_comment };

    } catch (e) {
      loadingSection.style.display = 'none';
      if (e instanceof TypeError && e.message.includes('fetch')) {
        showError(new Error('ネットワーク接続を確認してください。インターネットに接続されていない可能性があります。'));
      } else {
        showError(e);
      }
    } finally {
      updateExecuteBtn();
    }
  }

  function showError(error) {
    errorSection.style.display = 'block';
    if (error.message.startsWith('API_QUOTA_EXCEEDED')) {
      const isPro = error.message.includes('2.5-pro');
      $('#errorTitle').textContent = 'APIクォータ超過';
      errorMessage.textContent = isPro
        ? 'Gemini 2.5 Pro は有料プランのAPIキーが必要です。無料APIキーをご利用の場合は、Flashモデルを選択してください。'
        : 'Gemini APIの利用制限に達しました。しばらく待ってから再試行するか、有料プランにアップグレードしてください。';
    } else if (error.message === 'JSON_PARSE_ERROR') {
      $('#errorTitle').textContent = '応答解析エラー';
      errorMessage.textContent = 'AIの応答をJSON形式で解析できませんでした。再試行してください。';
    } else {
      $('#errorTitle').textContent = 'エラーが発生しました';
      errorMessage.textContent = error.message;
    }
  }

  /* ----------------------------------------------------------
   *  RENDER RESULTS
   * ---------------------------------------------------------- */
  function renderResults(result, nevAgg, manualAgg, cost, usage, modelId) {
    resultSection.style.display = 'block';

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
    detectedGrid.innerHTML = [
      detectedItem('図面名称', info.drawing_title),
      detectedItem('設置場所', info.facility_name),
      detectedItem('作成者', info.author),
      detectedItem('作成日', info.creation_date),
      detectedItem('縮尺', info.scale),
      detectedItem('配電方法', info.power_distribution),
      detectedItem('充電設備', chargerInfo),
      detectedItem('台数', info.charger_count),
      detectedItem('色分け', info.color_usage),
      detectedItem('既設充電設備', info.has_existing_equipment),
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

    // AI Comment
    if (result.ai_comment) {
      aiCommentSection.style.display = 'block';
      aiComment.textContent = result.ai_comment;
    } else {
      aiCommentSection.style.display = 'none';
    }

    // Cost
    if (cost && usage) {
      costSection.style.display = 'block';
      const modelNames = {
        'gemini-2.5-pro': 'Gemini 2.5 Pro',
        'gemini-2.5-flash': 'Gemini 2.5 Flash',
        'gemini-2.0-flash': 'Gemini 2.0 Flash',
      };
      const yenRate = 150;
      const totalUsd = parseFloat(cost.totalCost);
      const yenEstimate = Math.round(totalUsd * yenRate * 10) / 10;
      costModel.textContent = modelNames[modelId] || modelId;
      costInput.textContent = `${usage.promptTokens.toLocaleString()} tokens（$${cost.inputCost}）`;
      costOutput.textContent = `${usage.completionTokens.toLocaleString()} tokens（$${cost.outputCost}）`;
      costTotal.textContent = `$${cost.totalCost}（約 ${yenEstimate}円）`;
    }

    // Scroll to results
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function statusLabel(status) {
    if (status === 'pass') return 'PASS';
    if (status === 'fail') return 'FAIL';
    return 'WARN';
  }

  function detectedItem(label, value) {
    const display = value && String(value).trim() ? escapeHtml(String(value).trim()) : '未検出';
    return `<div class="detected-item">
      <span class="detected-item-label">${escapeHtml(label)}</span>
      <span class="detected-item-value">${display}</span>
    </div>`;
  }

  function renderCategoryResults(agg, group) {
    const cats = Object.entries(agg.categories)
      .filter(([key]) => DrawingChecker.CATEGORIES[key]?.group === group)
      .sort(([a], [b]) => (DrawingChecker.CATEGORIES[a]?.sort || 99) - (DrawingChecker.CATEGORIES[b]?.sort || 99));

    return cats.map(([catKey, cat]) => {
      const meta = DrawingChecker.CATEGORIES[catKey];
      if (!meta) return '';

      const summaryParts = [];
      if (cat.pass > 0) summaryParts.push(`<span class="cat-pass">${cat.pass} Pass</span>`);
      if (cat.fail > 0) summaryParts.push(`<span class="cat-fail">${cat.fail} Fail</span>`);
      if (cat.warn > 0) summaryParts.push(`<span class="cat-warn">${cat.warn} Warn</span>`);

      const itemsHtml = cat.items.map((item) => {
        const icon = statusIcon(item.status);
        const condHtml = item.condition
          ? `<span class="check-condition">${item.condition}</span>`
          : '';
        return `<div class="check-item">
          <span class="check-status ${item.status}">${icon}</span>
          <div class="check-body">
            <div class="check-label">${item.label}</div>
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
        <div class="category-header">
          <span class="category-icon">${meta.icon}</span>
          <span class="category-title">${meta.title}</span>
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

  /* ----------------------------------------------------------
   *  CATEGORY TOGGLE (event delegation)
   * ---------------------------------------------------------- */
  document.addEventListener('click', (e) => {
    const header = e.target.closest('.category-header');
    if (!header) return;
    const group = header.closest('.category-group');
    if (!group) return;
    group.classList.toggle('open');
    const items = group.querySelector('.category-items');
    if (items) items.classList.toggle('collapsed');
  });

  /* ----------------------------------------------------------
   *  TABS
   * ---------------------------------------------------------- */
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      $$('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  /* ----------------------------------------------------------
   *  COPY & NEW CHECK
   * ---------------------------------------------------------- */
  copyBtn.addEventListener('click', () => {
    if (!lastResult) return;
    const text = DrawingChecker.resultToText(
      lastResult.type, lastResult.detected, lastResult.nevAgg, lastResult.manualAgg, lastResult.aiComment
    );
    navigator.clipboard.writeText(text).then(() => {
      const orig = copyBtn.innerHTML;
      copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> コピーしました';
      setTimeout(() => { copyBtn.innerHTML = orig; }, 2000);
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  });

  newCheckBtn.addEventListener('click', () => {
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    clearFile();
    typeCards.forEach((c) => c.classList.remove('active'));
    state.selectedType = null;
    updateExecuteBtn();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ----------------------------------------------------------
   *  INIT
   * ---------------------------------------------------------- */
  updateExecuteBtn();
});
