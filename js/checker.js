/* ============================================================
 *  電気系統図 要件判定チェックツール - checker.js
 *  Core checking logic: NeV requirements + Drawing Center Manual
 * ============================================================ */
const DrawingChecker = (() => {
  'use strict';

  /* ----------------------------------------------------------
   *  1. CHECK ITEM DEFINITIONS
   * ---------------------------------------------------------- */

  // --- NeV Requirements (共通) ---
  const NEV_COMMON_CHECKS = [
    // ① 図面基本情報
    { id: 'nev_title', category: 'nev_basic_info', label: '図面名称が「電気系統図」であること', detail: '「配線系統図」「電気配線図」等は不可。「電気系統図」と正確に記載されていること。' },
    { id: 'nev_location', category: 'nev_basic_info', label: '設置場所名称の記載', detail: '申請で入力した設置場所名称と一致すること（略称不可）。設置場所そのものが確認できること。' },
    { id: 'nev_author', category: 'nev_basic_info', label: '作成者名の記載', detail: '作成者名が記載されていること。' },
    { id: 'nev_scale', category: 'nev_basic_info', label: '縮尺の記載', detail: '縮尺が記載されていること（「-」または「A3:1/100」等）。' },
    { id: 'nev_date', category: 'nev_basic_info', label: '作成日の記載', detail: '作成日が記載されていること。本補助金の事業開始日以降であること。' },

    // ② 充電設備の仕様
    { id: 'nev_charger_type', category: 'nev_charger_spec', label: '充電設備の種類の記載', detail: '急速・普通等の種類が記載されていること。' },
    { id: 'nev_charger_maker', category: 'nev_charger_spec', label: '充電設備のメーカー名の記載', detail: 'メーカー名が記載されていること。' },
    { id: 'nev_charger_model', category: 'nev_charger_spec', label: '充電設備の型式の記載', detail: '型式が記載されていること。' },

    // ③ 配電方法
    { id: 'nev_power_dist', category: 'nev_power_dist', label: '配電方法の種類の記載', detail: '例：1φ3W 100/200V、3φ3W 6.6kV/210V 等。配電方式が明記されていること。' },

    // ④ 電源元の仕様
    { id: 'nev_power_source', category: 'nev_power_source', label: '受電元（キュービクル/分電盤/手元開閉器）の図示', detail: '受電元のキュービクルや分電盤、手元開閉器が図示されていること。' },
    { id: 'nev_panel_name', category: 'nev_power_source', label: '盤名称の記載', detail: '盤名称がある場合はその名称が記載されていること。' },

    // ⑤ ブレーカーの仕様
    { id: 'nev_breaker_all', category: 'nev_breaker', label: '充電設備設置工事に伴うブレーカーの全記載', detail: '工事に伴う全てのブレーカーが記載されていること。' },
    { id: 'nev_breaker_spec', category: 'nev_breaker', label: 'ブレーカーの仕様の記載', detail: '例：ELB2P2E、MCCB3P3E等の仕様が記載されていること。' },
    { id: 'nev_breaker_capacity', category: 'nev_breaker', label: 'ブレーカーの容量の記載', detail: '例：20AF/20AT、50AF/40AT等の容量（フレーム/トリップ）が記載されていること。' },
    { id: 'nev_breaker_upstream', category: 'nev_breaker', label: '幹線上流ブレーカー容量の記載', detail: '幹線の上流ブレーカー（既存含む）の容量が記載されていること。' },

    // ⑥ 電源線の仕様
    { id: 'nev_cable_all', category: 'nev_cable', label: '充電設備設置工事に伴う電源線の全記載', detail: '工事に伴う全ての電源線が記載されていること。' },
    { id: 'nev_cable_type', category: 'nev_cable', label: '配線の種類の記載', detail: '例：CV5.5-3C、CVT22sq等。配線種別が記載されていること。' },

    // ⑦ 接地の仕様
    { id: 'nev_ground_point', category: 'nev_ground', label: '接地箇所の記載', detail: 'どこから接地に配線するのかわかるように記載されていること。' },
    { id: 'nev_ground_class', category: 'nev_ground', label: '接地種別の記載', detail: '例：Ec、Ed等の接地種別が記載されていること。' },
    { id: 'nev_ground_wire', category: 'nev_ground', label: 'アース線の記載', detail: '例：IV5.5sq等のアース線仕様が記載されていること。' },

    // 専用配線の確認
    { id: 'nev_dedicated_line', category: 'nev_dedicated', label: '専用配線であることの確認', detail: '電源元から充電設備まで専用配線で結線されていることが確認できること。他用途配線が混在していないこと。' },
  ];

  // --- NeV Requirements (条件付き) ---
  const NEV_CONDITIONAL_CHECKS = [
    // ⑤追加（既存分電盤利用時）
    { id: 'nev_breaker_margin', category: 'nev_breaker', label: '既存分電盤の幹線ブレーカー容量余裕の記載', detail: '既存分電盤を利用する場合、幹線ブレーカーの容量に余裕があるか記載（例：「幹線ブレーカーの容量に不足はありません」）。容量変更がある場合は変更前→変更後を記載。', condition: '既存分電盤を利用する場合' },

    // ⑥追加
    { id: 'nev_cable_1c_earth', category: 'nev_cable', label: '1Cをアースに使用する場合の記載', detail: '1Cをアースに使用する場合はその旨が記載されていること。', condition: '1Cをアースに使用する場合' },

    // ⑧ 通信線
    { id: 'nev_comm_line', category: 'nev_comm', label: '通信線の記載', detail: '課金機などの別体装置がある場合の配線が電気系統図に記載されていること。', condition: '課金機等の別体装置がある場合' },

    // ⑨ 電源配線/電灯
    { id: 'nev_lighting', category: 'nev_lighting', label: '電灯配線の記載', detail: '充電設備・充電スペースを照らす電灯の配線がある場合、電気系統図に記載されていること。配線種類、タイマースイッチ等の設置箇所も記載。', condition: '電灯設備がある場合' },

    // ⑩ デマンド制御
    { id: 'nev_demand', category: 'nev_demand', label: 'デマンド制御の同時稼働台数の記載', detail: '複数台設置かつデマンドコントローラーを使用している場合、同時稼働台数が記載されていること。', condition: '複数台設置かつデマンド制御がある場合' },

    // ⑪ 既存充電設備
    { id: 'nev_existing_diagram', category: 'nev_existing', label: '既存充電設備の電気系統図の記載', detail: '既存充電設備がある場合、その現在の電気系統図が記載されていること。', condition: '既存充電設備がある場合（増設・撤去新設）' },

    // 高圧受変電設備
    { id: 'nev_transformer', category: 'nev_power_source', label: '変圧器容量の記載', detail: '高圧受変電設備の場合、変圧器の容量が記載されていること。', condition: '高圧受変電設備の場合' },

    // 新規契約
    { id: 'nev_new_contract', category: 'nev_power_source', label: '新規契約機器のメーカー名・型式', detail: '特別措置等で新規契約する場合、引込開閉器等のメーカー名と型式が記載されていること。', condition: '新規で電力契約する場合' },
  ];

  // --- 作図センターマニュアル判定（目的地 6kW/9.6kW） ---
  const MANUAL_MOKUTEKICHI_CHECKS = [
    { id: 'man_m_location', category: 'man_basic', label: '設置場所 = 施設正式名称 + 普通充電設備設置工事', detail: '設置場所欄に「施設正式名称 + 普通充電設備設置工事」と記載されていること。' },
    { id: 'man_m_title', category: 'man_basic', label: '図面名称 = 「電気系統図」', detail: '図面名称が「電気系統図」であること。既設の場合は「既設電気系統図」。' },
    { id: 'man_m_author', category: 'man_basic', label: '作成者 = 「ENECHANGE EVラボ株式会社」', detail: '作成者が「ENECHANGE EVラボ株式会社」であること。' },
    { id: 'man_m_scale', category: 'man_basic', label: '縮尺 = 「-」', detail: '目的地の電気系統図では縮尺が「-」であること。' },
    { id: 'man_m_date', category: 'man_basic', label: '作成日 = ミラエネ指定日', detail: '作成日が所定の日付であること。' },

    { id: 'man_m_equip_spec', category: 'man_equip', label: '充電設備の仕様（種類・メーカー名・型式）の記載', detail: '充電設備の種類（普通）、メーカー名、型式が記載されていること。' },
    { id: 'man_m_power_type', category: 'man_equip', label: '配電方法の記載（例：1Φ3W100/200V）', detail: '受電方式が記載されていること。' },
    { id: 'man_m_panel_name', category: 'man_panel', label: '盤名称が配線ルート図と一致', detail: '電源盤・分電盤の名称が配線ルート図と一致していること。' },
    { id: 'man_m_cable_type', category: 'man_cable', label: '電源元から充電設備までの配線種類の記載', detail: '例：CVT22sq等、配線種類が記載されていること。' },
    { id: 'man_m_breaker_spec', category: 'man_breaker', label: 'ブレーカー仕様・容量の記載', detail: 'ブレーカーの仕様（例：ELB2P2E）と容量（例：50AF/40AT）が全て記載されていること。' },

    { id: 'man_m_ground', category: 'man_ground', label: '接地の記載（接地線・接地種別・盤内接続）', detail: '接地線（例：IV5.5sq）、接地種別（例：ED）、盤内での接続が記載されていること。' },
    { id: 'man_m_loadbalance', category: 'man_demand', label: 'ローバラ注記の記載', detail: '「※デマンドコントロール機能 充電器同時利用で分電盤主幹ブレーカー容量を超える場合、一時的に充電出力を制御する」の注記が記載されていること。' },
    { id: 'man_m_new_panel', category: 'man_panel', label: '新設盤のメーカー名・型式の記載', detail: '新設/特別引込の場合、新設分電盤・電源盤のメーカー名と型式が記載されていること。' },
    { id: 'man_m_capacity_note', category: 'man_annotation', label: '電気容量確保確認済み注記', detail: '「各ブレーカーにおいて、必要な電気容量確保確認済み」の注記が記載されていること。' },

    // 色分け
    { id: 'man_m_color_new', category: 'man_color', label: '新設部分が赤色で記載', detail: '新設の盤・ブレーカー・配線・充電設備が赤色で描かれていること。' },
    { id: 'man_m_color_exist', category: 'man_color', label: '既設部分が黒色で記載', detail: '既設のキュービクル・分電盤・ブレーカーが黒色で描かれていること。' },

    // 既設予備ブレーカー表記
    { id: 'man_m_spare_breaker', category: 'man_breaker', label: '既設予備ブレーカー/予備ブレーカーの表記', detail: '既存電源から取得する場合、「既設予備ブレーカー」（既設流用）または「予備ブレーカー」（新設）の正しい分類表記がされていること。' },

    // 他用途配線
    { id: 'man_m_no_mixed', category: 'man_dedicated', label: '他用途配線が混在していないこと', detail: '充電設備専用の配線経路のみであること。他用途（照明・動力等）の機器が充電配線経路上に接続されていないこと。' },

    // 補助金対象外表記
    { id: 'man_m_subsidy_label', category: 'man_annotation', label: '補助金対象外の適切な表記', detail: '電力量計、既設予備ブレーカー等の補助金対象外部分に「※補助金対象外」の表記があること（該当する場合）。' },
  ];

  // --- 作図センターマニュアル判定（基礎 3kW） ---
  const MANUAL_KISO_CHECKS = [
    { id: 'man_k_location', category: 'man_basic', label: '設置場所 = 施設正式名称 + 普通充電設備設置工事', detail: '設置場所欄に「施設正式名称 + 普通充電設備設置工事」と記載されていること。' },
    { id: 'man_k_title', category: 'man_basic', label: '図面名称 = 「電気系統図」', detail: '図面名称が「電気系統図」であること。既設の場合は「既設電気系統図」。' },
    { id: 'man_k_author', category: 'man_basic', label: '作成者 = 「ENECHANGE EVラボ株式会社」', detail: '作成者が「ENECHANGE EVラボ株式会社」であること。' },
    { id: 'man_k_scale', category: 'man_basic', label: '縮尺 = 「A3:1/100」', detail: '基礎の電気系統図では縮尺が「A3:1/100」であること。' },
    { id: 'man_k_date', category: 'man_basic', label: '作成日 = ミラエネ指定日', detail: '作成日が所定の日付であること。' },

    { id: 'man_k_simultaneous', category: 'man_demand', label: '同時運転台数の正確性', detail: '同時運転台数が正しいこと（1-10台:2台同時、11-15台:3台同時、16-20台:4台同時）。' },
    { id: 'man_k_equip_spec', category: 'man_equip', label: '充電設備の仕様（種類・メーカー名・型式）の記載', detail: '充電設備の種類（普通）、メーカー名、型式が記載されていること。' },
    { id: 'man_k_power_type', category: 'man_equip', label: '配電方法の記載（例：1Φ3W100/200V）', detail: '受電方式が記載されていること。' },
    { id: 'man_k_panel_name', category: 'man_panel', label: '盤名称（制御盤含む）が配線ルート図と一致', detail: '電源盤・分電盤・制御盤の名称が配線ルート図と一致していること。' },

    { id: 'man_k_cable_count', category: 'man_cable', label: '配線種類が台数に応じた正しい仕様', detail: '1-15台:CVT22sq、16-20台:CVT38sqであること。' },
    { id: 'man_k_main_breaker', category: 'man_breaker', label: '主幹ブレーカーが台数に応じた正しい容量', detail: '1-10台:50AT、11-15台:75AT、16-20台:100ATであること。' },
    { id: 'man_k_branch_breaker', category: 'man_breaker', label: '分岐ブレーカーの仕様・容量', detail: '分岐ブレーカーの仕様と容量が正しいこと（例：ELB 2P2E 30AF/20AT、1盤構成は30AF/20AT、2盤構成は50AF/20AT）。' },
    { id: 'man_k_ground', category: 'man_ground', label: '接地の記載（接地種別・接地線）', detail: '接地種別（ED等）、接地線（IV5.5sq）が記載されていること。' },

    { id: 'man_k_demand_note', category: 'man_demand', label: 'デマンドコントロール注記の記載', detail: '「※デマンドコントロール機能 充電器同時利用で分電盤主幹ブレーカー容量を超える場合、一時的に充電出力を制御する」の注記が記載されていること。' },
    { id: 'man_k_new_panel', category: 'man_panel', label: '新設盤のメーカー名・型式の記載', detail: '新設分電盤・電源盤のメーカー名（日東工業等）と型式（OR16-57C等）が記載されていること。' },
    { id: 'man_k_capacity_note', category: 'man_annotation', label: '電気容量確保確認済み注記', detail: '「各ブレーカーにおいて、必要な電気容量確保確認済み」の注記が記載されていること。' },

    // 色分け
    { id: 'man_k_color_new', category: 'man_color', label: '新設部分が赤色で記載', detail: '新設の盤・ブレーカー・配線・充電設備が赤色で描かれていること。' },
    { id: 'man_k_color_exist', category: 'man_color', label: '既設部分が黒色で記載', detail: '既設のキュービクル・分電盤・ブレーカーが黒色で描かれていること。' },

    // 既設予備ブレーカー表記
    { id: 'man_k_spare_breaker', category: 'man_breaker', label: '既設予備ブレーカー/予備ブレーカーの表記', detail: '既存電源から取得する場合、正しい分類（既設予備ブレーカー/予備ブレーカー/空ブレーカー）の表記がされていること。' },

    // 他用途配線
    { id: 'man_k_no_mixed', category: 'man_dedicated', label: '他用途配線が混在していないこと', detail: '充電設備専用の配線経路のみであること。' },

    // 既設充電設備
    { id: 'man_k_existing', category: 'man_existing', label: '既設充電設備がある場合の電気系統図', detail: '既設充電設備がある場合、「既設電気系統図」として別ページに記載されていること。' },

    // 補助金対象外表記
    { id: 'man_k_subsidy_label', category: 'man_annotation', label: '補助金対象外の適切な表記', detail: '電力量計、既設予備ブレーカー等の補助金対象外部分に適切な表記があること。' },
  ];

  /* ----------------------------------------------------------
   *  2. CATEGORY METADATA
   * ---------------------------------------------------------- */
  const CATEGORIES = {
    // NeV Requirements categories
    nev_basic_info:  { icon: '1', title: '図面基本情報', group: 'nev', sort: 1 },
    nev_charger_spec: { icon: '2', title: '充電設備の仕様', group: 'nev', sort: 2 },
    nev_power_dist:  { icon: '3', title: '配電方法', group: 'nev', sort: 3 },
    nev_power_source: { icon: '4', title: '電源元の仕様', group: 'nev', sort: 4 },
    nev_breaker:     { icon: '5', title: 'ブレーカーの仕様', group: 'nev', sort: 5 },
    nev_cable:       { icon: '6', title: '電源線の仕様', group: 'nev', sort: 6 },
    nev_ground:      { icon: '7', title: '接地の仕様', group: 'nev', sort: 7 },
    nev_comm:        { icon: '8', title: '通信線', group: 'nev', sort: 8 },
    nev_lighting:    { icon: '9', title: '電灯配線', group: 'nev', sort: 9 },
    nev_demand:      { icon: '10', title: 'デマンド制御', group: 'nev', sort: 10 },
    nev_existing:    { icon: '11', title: '既存充電設備の系統図', group: 'nev', sort: 11 },
    nev_dedicated:   { icon: '-', title: '専用配線の確認', group: 'nev', sort: 12 },

    // Manual categories
    man_basic:      { icon: 'A', title: '図面基本情報', group: 'manual', sort: 1 },
    man_equip:      { icon: 'B', title: '充電設備仕様', group: 'manual', sort: 2 },
    man_panel:      { icon: 'C', title: '盤の記載', group: 'manual', sort: 3 },
    man_cable:      { icon: 'D', title: '配線の記載', group: 'manual', sort: 4 },
    man_breaker:    { icon: 'E', title: 'ブレーカーの記載', group: 'manual', sort: 5 },
    man_ground:     { icon: 'F', title: '接地の記載', group: 'manual', sort: 6 },
    man_demand:     { icon: 'G', title: 'デマンド制御/ローバラ', group: 'manual', sort: 7 },
    man_color:      { icon: 'H', title: '色分けルール', group: 'manual', sort: 8 },
    man_dedicated:  { icon: 'I', title: '専用配線・他用途', group: 'manual', sort: 9 },
    man_annotation: { icon: 'J', title: '注記・表記', group: 'manual', sort: 10 },
    man_existing:   { icon: 'K', title: '既設充電設備', group: 'manual', sort: 11 },
  };

  /* ----------------------------------------------------------
   *  3. GEMINI PROMPT BUILDER
   * ---------------------------------------------------------- */
  function buildPrompt(type) {
    const isKiso = type === 'kiso';
    const typeLabel = isKiso ? '基礎充電（マンション等集合住宅向け 3kW）' : '目的地充電（商業施設・ホテル等向け 6kW/9.6kW）';

    return `あなたは、EV充電インフラ補助金（NeV）の申請に使用される「電気系統図」の審査を行う高精度AIチェッカーです。

## 対象図面の種別
**${typeLabel}**

## 指示
アップロードされた画像はPDFから変換された「電気系統図」の各ページです。
以下の2つのカテゴリの全チェック項目について、図面を極めて精密に読み取り、判定してください。
図面のテキスト、記号、配線の色（赤=新設、黒=既設）、接続関係を全て正確に読み取ること。

**重要**: 図面に記載されている文字・数値は一字一句正確に読み取ってください。曖昧な場合は「warn」としてください。

---

## カテゴリ1: NeV要件判定
NeV補助金の交付申請における電気系統図の記載要件（手引き 5-9-4）に基づく判定。

### 必須項目
① **図面基本情報**
- 図面名称が「電気系統図」であること（「配線系統図」「電気配線図」等は不備）
- 設置場所名称の記載（略称不可）
- 作成者名の記載
- 縮尺の記載
- 作成日の記載（補助金事業開始日以降であること）

② **充電設備の仕様**
- 充電設備の種類（急速・普通等）
- メーカー名
- 型式

③ **配電方法**
- 配電方法の種類（例：1φ3W 100/200V）

④ **電源元の仕様**
- 受電元のキュービクル/分電盤/手元開閉器の図示
- 盤名称がある場合はその名称
- 高圧受変電設備の場合は変圧器容量
- 新規契約の場合は引込開閉器のメーカー名・型式

⑤ **ブレーカーの仕様**
- 充電設備設置工事に伴うブレーカーの全記載
- 仕様（例：ELB2P2E）
- 容量（例：20AF/20AT）
- 幹線上流ブレーカーの容量
- 既存分電盤利用時：容量余裕の記載または変更前後の記載

⑥ **電源線の仕様**
- 全ての電源線の記載
- 配線の種類（例：CV5.5-3C、CVT22sq）
- 1Cをアースに使用する場合はその旨の記載

⑦ **接地の仕様**
- 接地箇所（どこから接地に配線するか）
- 接地種別（例：Ec、Ed）
- アース線（例：IV5.5sq）

**専用配線の確認**
- 電源元から充電設備まで専用配線で結線されていること

### 条件付き項目
⑧ **通信線**: 課金機等の別体装置がある場合 → 通信線の記載
⑨ **電灯配線**: 充電スペースの電灯がある場合 → 配線種類の記載
⑩ **デマンド制御**: 複数台＋デマンドコントローラー使用時 → 同時稼働台数の記載
⑪ **既存充電設備**: 既存充電設備がある場合 → 既存の電気系統図の記載

---

## カテゴリ2: 作図センターマニュアル判定
ENECHANGE社の作図センターマニュアル（交付申請図面作成マニュアルVer4.0、標準設計仕様書Ver4.0、配線配管長の考え方）に基づく判定。
NeV要件とは細部が異なる社内基準です。

${isKiso ? `### 基礎充電（3kW）固有のマニュアル要件
- 設置場所 = 「施設正式名称 + 普通充電設備設置工事」
- 図面名称 = 「電気系統図」
- 作成者 = 「ENECHANGE EVラボ株式会社」
- 縮尺 = 「A3:1/100」
- 同時運転台数の正確性（1-10台:2台同時、11-15台:3台同時、16-20台:4台同時）
- 配線種類が台数に応じた正しい仕様（1-15台:CVT22sq、16-20台:CVT38sq）
- 主幹ブレーカーが台数に応じた正しい容量（1-10台:50AT、11-15台:75AT、16-20台:100AT）
- 分岐ブレーカーの仕様（1盤:ELB 2P2E 30AF/20AT、2盤:50AF/20AT）
- 新設盤のメーカー名・型式の記載（例：日東工業 OR16-57C）
- デマンドコントロール注記の記載
- 「各ブレーカーにおいて、必要な電気容量確保確認済み」注記
- 新設部分=赤色、既設部分=黒色
- 既設予備ブレーカー/予備ブレーカーの正しい分類表記
- 他用途配線が混在していないこと
- 既設充電設備がある場合は「既設電気系統図」として別ページ
- 補助金対象外部分の適切な表記` : `### 目的地充電（6kW/9.6kW）固有のマニュアル要件
- 設置場所 = 「施設正式名称 + 普通充電設備設置工事」
- 図面名称 = 「電気系統図」
- 作成者 = 「ENECHANGE EVラボ株式会社」
- 縮尺 = 「-」（ノンスケール）
- 配電方法の記載
- 盤名称が配線ルート図と一致
- 電源元から充電設備までの配線種類の記載
- ブレーカー仕様・容量の全記載
- 接地の記載（接地線・接地種別・盤内接続）
- ローバラ（ロードバランシング）注記の記載
- 新設盤のメーカー名・型式の記載（新設/特別引込の場合）
- 「各ブレーカーにおいて、必要な電気容量確保確認済み」注記
- 新設部分=赤色、既設部分=黒色
- 既設予備ブレーカー/予備ブレーカーの正しい分類表記
- 他用途配線が混在していないこと
- 補助金対象外部分の適切な表記`}

---

## 出力形式
以下のJSON形式で正確に出力してください。項目IDは変更しないでください。

\`\`\`json
{
  "detected_info": {
    "drawing_title": "図面名称として読み取れた文字列",
    "facility_name": "設置場所名称として読み取れた文字列",
    "author": "作成者として読み取れた文字列",
    "scale": "縮尺として読み取れた文字列",
    "creation_date": "作成日として読み取れた文字列",
    "charger_type": "充電設備の種類",
    "charger_maker": "メーカー名",
    "charger_model": "型式",
    "charger_count": "充電設備の台数",
    "power_distribution": "配電方法",
    "panel_names": ["盤名称のリスト"],
    "breakers": ["検出されたブレーカー仕様・容量のリスト"],
    "cables": ["検出された配線種類のリスト"],
    "grounding": "接地の記載内容",
    "color_usage": "色分けの状況（赤:新設/黒:既設の使い分け）",
    "has_existing_equipment": "既設充電設備の有無（true/false/不明）",
    "has_demand_control": "デマンド制御の有無（true/false/不明）",
    "annotations": ["検出された注記・注釈のリスト"]
  },
  "nev_results": {
${NEV_COMMON_CHECKS.map(c => `    "${c.id}": { "status": "pass|fail|warn|na", "finding": "判定根拠の詳細" }`).join(',\n')},
${NEV_CONDITIONAL_CHECKS.map(c => `    "${c.id}": { "status": "pass|fail|warn|na", "finding": "判定根拠の詳細" }`).join(',\n')}
  },
  "manual_results": {
${(isKiso ? MANUAL_KISO_CHECKS : MANUAL_MOKUTEKICHI_CHECKS).map(c => `    "${c.id}": { "status": "pass|fail|warn|na", "finding": "判定根拠の詳細" }`).join(',\n')}
  },
  "ai_comment": "全体的な所見（図面の完成度、特に注意すべき点、改善提案をまとめて記載）"
}
\`\`\`

### 判定基準
- **pass**: 要件を満たしている
- **fail**: 要件を満たしていない（記載なし、記載不備、誤記載）
- **warn**: 読み取りが困難、または記載はあるが正確性に懸念がある
- **na**: 当該条件に該当しないため判定不要

### 重要な注意事項
1. 図面の文字は拡大して一字一句正確に読み取ること
2. 配線の色（赤/黒）を正確に判別すること
3. 条件付き項目は、該当条件が図面から判断できない場合は「warn」
4. findingには具体的に読み取った文字列・数値を含めること
5. 全てのチェック項目について必ず判定を返すこと（省略不可）
6. 正解事例のパターン: 目的地は左側に既設キュービクル(黒)→幹線(赤)→EV分電盤(赤)→分岐(赤)→充電設備(赤)の流れ、基礎は責任分界点→電力量計→分電盤→制御盤→充電設備の流れ`;
  }

  /* ----------------------------------------------------------
   *  4. PDF TO IMAGES
   * ---------------------------------------------------------- */
  async function pdfToImages(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const maxPages = 6;
    const pagesToRender = Math.min(totalPages, maxPages);
    const images = [];

    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });

      // Safe canvas size: max 4096px on longest side
      const maxDim = 4096;
      let scale = 1;
      if (viewport.width > maxDim || viewport.height > maxDim) {
        scale = maxDim / Math.max(viewport.width, viewport.height);
      }
      // Minimum resolution: 2048px on longest side for readability
      const minDim = 2048;
      if (viewport.width * scale < minDim && viewport.height * scale < minDim) {
        scale = minDim / Math.max(viewport.width, viewport.height);
      }

      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(scaledViewport.width);
      canvas.height = Math.floor(scaledViewport.height);
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      const jpeg = canvas.toDataURL('image/jpeg', 0.92);
      images.push({
        pageNumber: i,
        data: jpeg.split(',')[1],
        mimeType: 'image/jpeg',
      });
    }

    return { images, totalPages, renderedPages: pagesToRender };
  }

  async function pdfToPreview(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  /* ----------------------------------------------------------
   *  5. GEMINI API CALLS
   * ---------------------------------------------------------- */
  async function testApiKey(apiKey) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!resp.ok) throw new Error('APIキーが無効です');
    return true;
  }

  async function checkModelAvailability(apiKey, modelId) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}?key=${apiKey}`
    );
    return resp.ok;
  }

  async function callGemini(apiKey, images, type, modelId) {
    const prompt = buildPrompt(type);

    const parts = [{ text: prompt }];
    for (const img of images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
      parts.push({
        text: `(上記画像はPDFの${img.pageNumber}ページ目です)`,
      });
    }

    const maxTokens = modelId.includes('2.0-flash') ? 8192 : 65536;

    const body = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: maxTokens,
      },
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 429) {
        throw new Error('API_QUOTA_EXCEEDED:' + modelId);
      }
      throw new Error(err.error?.message || `API Error: ${resp.status}`);
    }

    const data = await resp.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('APIから回答が返りませんでした。安全フィルターにかかった可能性があります。');
    }

    const candidate = data.candidates[0];
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('安全フィルターによりブロックされました。');
    }

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('APIからテキスト応答がありませんでした。');
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code block
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          parsed = JSON.parse(match[1].trim());
        } catch {
          throw new Error('JSON_PARSE_ERROR');
        }
      } else {
        throw new Error('JSON_PARSE_ERROR');
      }
    }

    // Token usage
    const usage = data.usageMetadata || {};

    return {
      result: parsed,
      usage: {
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
      truncated: candidate.finishReason === 'MAX_TOKENS',
    };
  }

  /* ----------------------------------------------------------
   *  6. RESULT AGGREGATION
   * ---------------------------------------------------------- */
  function getCheckItems(type) {
    const isKiso = type === 'kiso';
    return {
      nevCommon: NEV_COMMON_CHECKS,
      nevConditional: NEV_CONDITIONAL_CHECKS,
      manual: isKiso ? MANUAL_KISO_CHECKS : MANUAL_MOKUTEKICHI_CHECKS,
    };
  }

  const VALID_STATUSES = ['pass', 'fail', 'warn', 'na'];

  function aggregateResults(results, checks) {
    const categories = {};
    for (const check of checks) {
      const catKey = check.category;
      if (!categories[catKey]) {
        categories[catKey] = { items: [], pass: 0, fail: 0, warn: 0, na: 0 };
      }
      const raw = results[check.id] || { status: 'warn', finding: '未判定' };
      const status = VALID_STATUSES.includes(raw.status) ? raw.status : 'warn';
      const r = { ...raw, status };
      categories[catKey].items.push({ ...check, ...r });
      categories[catKey][status] += 1;
    }

    // Overall status
    let totalPass = 0, totalFail = 0, totalWarn = 0, totalChecked = 0;
    for (const cat of Object.values(categories)) {
      totalPass += cat.pass;
      totalFail += cat.fail;
      totalWarn += cat.warn;
      totalChecked += cat.pass + cat.fail + cat.warn;
    }

    let overall = 'pass';
    if (totalFail > 0) overall = 'fail';
    else if (totalWarn > 0) overall = 'warn';

    return { categories, totalPass, totalFail, totalWarn, totalChecked, overall };
  }

  /* ----------------------------------------------------------
   *  7. COST ESTIMATION
   * ---------------------------------------------------------- */
  const MODEL_PRICING = {
    'gemini-2.5-pro':   { input: 1.25, output: 10.0 },
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  };

  function estimateCost(usage, modelId) {
    const pricing = MODEL_PRICING[modelId] || MODEL_PRICING['gemini-2.5-flash'];
    const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;
    return {
      inputCost: inputCost.toFixed(4),
      outputCost: outputCost.toFixed(4),
      totalCost: (inputCost + outputCost).toFixed(4),
      currency: 'USD',
    };
  }

  /* ----------------------------------------------------------
   *  8. TEXT EXPORT
   * ---------------------------------------------------------- */
  function resultToText(type, detected, nevAgg, manualAgg, aiComment) {
    const typeLabel = type === 'kiso' ? '基礎充電' : '目的地充電';
    const lines = [];
    lines.push('='.repeat(60));
    lines.push(`電気系統図 要件判定チェック結果（${typeLabel}）`);
    lines.push(`判定日時: ${new Date().toLocaleString('ja-JP')}`);
    lines.push('='.repeat(60));

    // Detected info
    lines.push('\n--- 検出情報 ---');
    if (detected) {
      lines.push(`図面名称: ${detected.drawing_title || '未検出'}`);
      lines.push(`設置場所: ${detected.facility_name || '未検出'}`);
      lines.push(`作成者: ${detected.author || '未検出'}`);
      lines.push(`作成日: ${detected.creation_date || '未検出'}`);
      lines.push(`充電設備: ${detected.charger_type || ''} ${detected.charger_maker || ''} ${detected.charger_model || ''}`);
      lines.push(`台数: ${detected.charger_count || '未検出'}`);
      lines.push(`配電方法: ${detected.power_distribution || '未検出'}`);
    }

    // NeV results
    lines.push('\n--- NeV要件判定 ---');
    lines.push(`総合判定: ${nevAgg.overall === 'pass' ? 'PASS' : nevAgg.overall === 'fail' ? 'FAIL' : 'WARN'}`);
    lines.push(`合格: ${nevAgg.totalPass} / 不合格: ${nevAgg.totalFail} / 要確認: ${nevAgg.totalWarn}`);
    for (const [catKey, cat] of Object.entries(nevAgg.categories)) {
      const meta = CATEGORIES[catKey];
      if (!meta) continue;
      lines.push(`\n[${meta.title}]`);
      for (const item of cat.items) {
        const mark = item.status === 'pass' ? 'O' : item.status === 'fail' ? 'X' : item.status === 'na' ? '-' : '?';
        lines.push(`  ${mark} ${item.label}`);
        lines.push(`    -> ${item.finding}`);
      }
    }

    // Manual results
    lines.push('\n--- 作図センターマニュアル判定 ---');
    lines.push(`総合判定: ${manualAgg.overall === 'pass' ? 'PASS' : manualAgg.overall === 'fail' ? 'FAIL' : 'WARN'}`);
    lines.push(`合格: ${manualAgg.totalPass} / 不合格: ${manualAgg.totalFail} / 要確認: ${manualAgg.totalWarn}`);
    for (const [catKey, cat] of Object.entries(manualAgg.categories)) {
      const meta = CATEGORIES[catKey];
      if (!meta) continue;
      lines.push(`\n[${meta.title}]`);
      for (const item of cat.items) {
        const mark = item.status === 'pass' ? 'O' : item.status === 'fail' ? 'X' : item.status === 'na' ? '-' : '?';
        lines.push(`  ${mark} ${item.label}`);
        lines.push(`    -> ${item.finding}`);
      }
    }

    if (aiComment) {
      lines.push('\n--- AI所見 ---');
      lines.push(aiComment);
    }

    lines.push('\n' + '='.repeat(60));
    return lines.join('\n');
  }

  /* ----------------------------------------------------------
   *  PUBLIC API
   * ---------------------------------------------------------- */
  return {
    NEV_COMMON_CHECKS,
    NEV_CONDITIONAL_CHECKS,
    MANUAL_MOKUTEKICHI_CHECKS,
    MANUAL_KISO_CHECKS,
    CATEGORIES,
    getCheckItems,
    buildPrompt,
    pdfToImages,
    pdfToPreview,
    testApiKey,
    checkModelAvailability,
    callGemini,
    aggregateResults,
    estimateCost,
    resultToText,
  };
})();
