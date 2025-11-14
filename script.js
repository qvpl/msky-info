/* ===== DOM要素の取得 ===== */
const $ = id => document.getElementById(id);
const hostInput = $('host');
const searchButton = $('btn');
const resultDiv = $('result');

/* ===== Helper: 簡易HTMLエスケープ ===== */
function escapeHTML(str) {
  return String(str || "").replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/**
 * 共通のmetaフェッチロジック (ブラウザから直接実行)
 * @param {string} host
 * @returns {Promise<object>} metaオブジェクト
 */
async function getMeta(host) {
  const metaUrl = `https://${host}/api/meta`;

  // 5秒でタイムアウトするシグナル
  const signal = AbortSignal.timeout(5000);

  // 試行1: POST (v12以前や一部フォークで主流)
  try {
    const respPost = await fetch(metaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal, // タイムアウト設定
    });

    if (respPost.ok) {
      return respPost.json(); // POST成功
    }
    if (respPost.status !== 405 && respPost.status !== 404) {
      throw new Error(`POST failed (${respPost.status})`);
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error(`POST attempt timed out for ${host}`);
    } else {
      console.error(`POST attempt failed for ${host}: ${e.message}`);
    }
    // POSTが失敗しても（タイムアウト含む）、GETを試行するために処理を続行
  }

  // 試行2: GET (v13以降で主流)
  const respGet = await fetch(metaUrl, {
    signal, // GETにもタイムアウト設定
  });

  if (!respGet.ok) {
    // GETが失敗したら、ここで最終的なエラーとする
    throw new Error(`GET failed (${respGet.status})`);
  }
  return respGet.json(); // GET成功
}


/**
 * 検索処理の実行
 */
const doSearch = async () => {
  const host = hostInput.value.trim();
  if (!host) return;

  resultDiv.textContent = '取得中...';

  try {
    // サーバーAPI(/api/info)の代わりに、クライアントから直接 getMeta を呼び出す
    const meta = await getMeta(host);

    // 成功時のhealthオブジェクトをクライアント側で構築
    const health = {
      host,
      reachable: true,
      softwareName: meta.softwareName || meta.name || null,
      version: meta.version || null,
      description: meta.description || null,
      adminName: meta.maintainerName || null,
      adminEmail: meta.maintainerEmail || null,
      contactLink: meta.inquiryUrl || meta.repositoryUrl || null,
    };

    // --- 結果のレンダリング (Health) ---
    const descHtml = health.description
      ? `<p><strong>Description:</strong></p><p class="description">${escapeHTML(health.description)}</p>`
      : `<p><strong>Description:</strong> N/A</p>`;

    const contactLinkHtml = health.contactLink
      ? `<a href="${escapeHTML(health.contactLink)}" target="_blank" rel="noopener">${escapeHTML(health.contactLink)}</a>`
      : 'N/A';

    // --- 結果のレンダリング (Meta Details) ---
    // JSONで見づらかった部分を項目ごとに抽出
    const metaIcon = meta.iconUrl ? `<p><strong>Icon:</strong> <a href="${escapeHTML(meta.iconUrl)}" target="_blank" rel="noopener">${escapeHTML(meta.iconUrl)}</a></p>` : '';
    const metaBanner = meta.bannerUrl ? `<p><strong>Banner:</strong> <a href="${escapeHTML(meta.bannerUrl)}" target="_blank" rel="noopener">${escapeHTML(meta.bannerUrl)}</a></p>` : '';
    const metaTos = meta.tosUrl ? `<p><strong>Terms of Service:</strong> <a href="${escapeHTML(meta.tosUrl)}" target="_blank" rel="noopener">${escapeHTML(meta.tosUrl)}</a></p>` : '';
    const metaPrivacy = meta.privacyPolicyUrl ? `<p><strong>Privacy Policy:</strong> <a href="${escapeHTML(meta.privacyPolicyUrl)}" target="_blank" rel="noopener">${escapeHTML(meta.privacyPolicyUrl)}</a></p>` : '';
    const metaMaxLength = meta.maxNoteTextLength ? `<p><strong>Max Note Length:</strong> ${escapeHTML(meta.maxNoteTextLength)}</p>` : '';
    
    // サーバー独自ルール (配列の場合)
    let metaRulesHtml = '';
    if (meta.serverRules && Array.isArray(meta.serverRules) && meta.serverRules.length > 0) {
      metaRulesHtml = '<p><strong>Server Rules:</strong></p><ul class="rules">';
      meta.serverRules.forEach(rule => {
        metaRulesHtml += `<li>${escapeHTML(rule)}</li>`;
      });
      metaRulesHtml += '</ul>';
    }

    // --- 最終的なHTMLの組み立て ---
    resultDiv.innerHTML = `
      <p><strong>Host:</strong> ${escapeHTML(health.host)}</p>
      <p><strong>Status:</strong> <span style="color:#7ee787;">Online</span></p>
      ${descHtml}
      <p><strong>Version:</strong> ${escapeHTML(health.version || 'N/A')}</p>
      <p><strong>Admin:</strong> ${escapeHTML(health.adminName || 'N/A')}</p>
      <p><strong>Email:</strong> ${escapeHTML(health.adminEmail || 'N/A')}</p>
      <p><strong>Contact:</strong> ${contactLinkHtml}</p>
      
      <hr>
      
      <p style="font-weight:bold; opacity: 0.8;">--- Server Details (from /api/meta) ---</p>
      ${metaMaxLength}
      ${metaIcon}
      ${metaBanner}
      ${metaTos}
      ${metaPrivacy}
      ${metaRulesHtml}
    `;

  } catch (e) {
    // getMeta が失敗した場合 (Offline)
    console.error(`Client-side error for ${host}:`, e.message);

    // 失敗時のhealthオブジェクトを構築
    const health = {
      host,
      reachable: false,
      error: e.message,
    };

    resultDiv.innerHTML = `
      <p><strong>Host:</strong> ${escapeHTML(health.host)}</p>
      <p><strong>Status:</strong> <span style="color:#f88;">Offline</span></p>
      <p><strong>Error:</strong> ${escapeHTML(health.error)}</p>
    `;
  }
};

/* ===== イベントリスナーの設定 ===== */
searchButton.onclick = doSearch;
hostInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    doSearch();
  }
});
