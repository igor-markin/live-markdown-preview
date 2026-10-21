(() => {
  'use strict';

  const en = {
    title: 'Live Markdown Preview — a private Markdown editor in your browser',
    description: 'Write Markdown and watch it take shape. Drafts stay in your browser: no account, no server, no tracking. 19 color schemes, safe HTML copy, print to PDF.',
    skip: 'Skip to content', navLabel: 'Sections', langLabel: 'Site language',
    navFeatures: 'Features', navThemes: 'Themes', navPrivate: 'Privacy', openShort: 'Open editor',
    eyebrow: 'Free · open source · works offline once loaded',
    h1a: 'A little space', h1b: 'for your ideas.',
    lead: 'Write Markdown on the left, watch it take shape on the right. Your drafts stay in this browser: no account, no server, no tracking.',
    open: 'Open the editor', source: 'Source code',
    ctaMeta: 'Chrome, Firefox and Safari · desktop and mobile · MIT license',
    saved: 'Saved in this browser', previewLabel: 'Preview', srcLabel: 'Markdown source. Type here to try it.',
    demoCaption: 'Try it: this demo is editable. It uses a simplified renderer; the real editor speaks full GitHub Flavored Markdown.',
    factsLabel: 'In short',
    fact1: 'servers see your text: the page is static, everything happens on your device',
    fact2: 'color schemes, from GitHub Light to Catppuccin, Dracula and Nord',
    fact3n: 'No sign-up', fact3: 'open the page and start writing; drafts are saved as you type',
    featKicker: 'Features', featTitle: 'Everything a Markdown draft needs. Nothing it doesn’t.',
    f1t: 'Instant preview', f1: 'Rendering runs in a Web Worker, so even long documents do not freeze the editor.',
    f2t: 'GitHub Flavored Markdown', f2: 'Tables, task lists, strikethrough, autolinks and raw HTML — the way GitHub shows them.',
    f3t: 'Many drafts, one place', f3: 'A file sidebar, an outline of headings and a resizable split. Open and download real <code>.md</code> files.',
    f4t: 'Clean HTML in one click', f4: 'Copy Markdown or sanitized HTML, ready to paste into a CMS, an email or a docs page.',
    f5t: 'Print and PDF', f5: 'The preview prints cleanly: use the browser’s Save as PDF to share a finished page.',
    f6t: 'Hard to lose work', f6: 'Autosave, a conflict warning when two tabs edit one draft, and recovery of unsaved edits after a reload.',
    lookKicker: 'The editor', lookTitle: 'Source and preview, side by side.', shotsLabel: 'Screenshots',
    shot0: 'GitHub Light', shot1: 'Catppuccin Mocha', shot2: 'Theme picker',
    shotCap0: 'Files and outline on the left, Markdown in the middle, the live preview on the right.',
    shotCap1: 'The same workspace in Catppuccin Mocha: a softer dark scheme for long evenings.',
    shotCap2: 'Preview mode and the color scheme menu: 19 schemes, light and dark.',
    shotAlt0: 'The editor in GitHub Light: files and outline on the left, Markdown source in the middle, live preview on the right',
    shotAlt1: 'The editor in Catppuccin Mocha with lavender accents',
    shotAlt2: 'Preview mode with the color scheme menu open',
    themesKicker: 'Color schemes', themesTitle: 'Make yourself at home.',
    themesSub: 'The editor ships 19 color schemes for the source and the preview. Pick one here to repaint the demo above; inside the editor, your choice is remembered.',
    swatchLabel: 'Demo color scheme',
    privKicker: 'Privacy', privTitle: 'Your words never leave this browser.',
    p1t: 'You type', p1: 'CodeMirror edits the source. The page is static files, with no backend to send anything to.',
    p2t: 'A worker renders', p2: 'unified and remark turn Markdown into HTML in a background thread.',
    p3t: 'DOMPurify cleans', p3: 'Scripts, event handlers, frames, forms and unsafe links are removed before anything is shown.',
    p4t: 'IndexedDB keeps', p4: 'Drafts and preferences are saved locally on this device. No analytics, no telemetry.',
    privNote: 'Local means local: drafts live only in the browser and on the address where you wrote them. Clearing site data deletes them, so download important files as <code>.md</code>.',
    finalTitle: 'Start with a heading. Let the rest follow.', ph: 'Featured on Product Hunt ↗',
    footLabel: 'Links', issues: 'Report a bug', license: 'MIT license', author: 'Made by Igor Markin',
    demo: [
      '# A little space for your ideas',
      '',
      'From a first thought to something **worth sharing**.',
      '',
      '> Your words stay in this browser.',
      '',
      '## Make something good',
      '',
      '- [x] Find a quiet corner',
      '- [x] Turn a few thoughts into a draft',
      '- [ ] Share something you are proud of',
      '',
      '| Day | A small step |',
      '| --- | --- |',
      '| Monday | Collect ideas |',
      '| Friday | Polish and `share` |',
      ''
    ].join('\n')
  };

  const ru = {
    title: 'Live Markdown Preview — приватный Markdown-редактор в браузере',
    description: 'Пишите в Markdown и сразу видите результат. Черновики остаются в браузере: без аккаунта, сервера и слежки. 19 цветовых схем, чистый HTML, печать в PDF.',
    skip: 'Перейти к содержимому', navLabel: 'Разделы', langLabel: 'Язык сайта',
    navFeatures: 'Возможности', navThemes: 'Темы', navPrivate: 'Приватность', openShort: 'Открыть',
    eyebrow: 'Бесплатно · открытый код · после загрузки работает офлайн',
    h1a: 'Немного места', h1b: 'для ваших идей.',
    lead: 'Пишите Markdown слева — справа он сразу превращается в оформленный текст. Черновики остаются в этом браузере: без аккаунта, сервера и слежки.',
    open: 'Открыть редактор', source: 'Исходный код',
    ctaMeta: 'Chrome, Firefox и Safari · компьютер и телефон · лицензия MIT',
    saved: 'Сохранено в браузере', previewLabel: 'Просмотр', srcLabel: 'Исходный Markdown. Попробуйте что-нибудь написать.',
    demoCaption: 'Попробуйте: демо можно редактировать. Здесь упрощённый рендер, а редактор понимает весь GitHub Flavored Markdown. Интерфейс редактора — на английском.',
    factsLabel: 'Коротко',
    fact1: 'серверов видят ваш текст: страница статичная, всё происходит на вашем устройстве',
    fact2: 'цветовых схем — от GitHub Light до Catppuccin, Dracula и Nord',
    fact3n: 'Без регистрации', fact3: 'открыли страницу и пишете; черновик сохраняется на ходу',
    featKicker: 'Возможности', featTitle: 'Всё, что нужно черновику в Markdown. И ничего лишнего.',
    f1t: 'Мгновенный просмотр', f1: 'Рендер идёт в Web Worker, поэтому даже длинный документ не тормозит редактор.',
    f2t: 'GitHub Flavored Markdown', f2: 'Таблицы, списки задач, зачёркивание, автоссылки и HTML — так, как их показывает GitHub.',
    f3t: 'Много черновиков в одном месте', f3: 'Список файлов, оглавление по заголовкам и регулируемое разделение. Открывайте и скачивайте настоящие <code>.md</code>.',
    f4t: 'Чистый HTML в один клик', f4: 'Копируйте Markdown или очищенный HTML — для CMS, письма или документации.',
    f5t: 'Печать и PDF', f5: 'Просмотр аккуратно печатается: сохраните готовую страницу в PDF средствами браузера.',
    f6t: 'Работу трудно потерять', f6: 'Автосохранение, предупреждение, если один черновик правят в двух вкладках, и восстановление правок после перезагрузки.',
    lookKicker: 'Редактор', lookTitle: 'Исходник и результат рядом.', shotsLabel: 'Скриншоты',
    shot0: 'GitHub Light', shot1: 'Catppuccin Mocha', shot2: 'Выбор темы',
    shotCap0: 'Слева файлы и оглавление, в центре Markdown, справа живой просмотр.',
    shotCap1: 'То же рабочее место в Catppuccin Mocha — мягкая тёмная схема для долгих вечеров.',
    shotCap2: 'Режим просмотра и меню цветовых схем: 19 светлых и тёмных вариантов.',
    shotAlt0: 'Редактор в теме GitHub Light: слева файлы и оглавление, в центре Markdown, справа просмотр',
    shotAlt1: 'Редактор в теме Catppuccin Mocha с лавандовыми акцентами',
    shotAlt2: 'Режим просмотра с открытым меню цветовых схем',
    themesKicker: 'Цветовые схемы', themesTitle: 'Устраивайтесь поудобнее.',
    themesSub: 'В редакторе 19 цветовых схем для исходника и просмотра. Выберите любую — демо наверху перекрасится. В самом редакторе выбор запоминается.',
    swatchLabel: 'Цветовая схема демо',
    privKicker: 'Приватность', privTitle: 'Ваш текст не покидает браузер.',
    p1t: 'Вы пишете', p1: 'Исходник правится в CodeMirror. Страница — статичные файлы, отправлять текст некуда.',
    p2t: 'Worker рендерит', p2: 'unified и remark превращают Markdown в HTML в фоновом потоке.',
    p3t: 'DOMPurify чистит', p3: 'Скрипты, обработчики событий, фреймы, формы и опасные ссылки удаляются до показа.',
    p4t: 'IndexedDB хранит', p4: 'Черновики и настройки сохраняются на этом устройстве. Ни аналитики, ни телеметрии.',
    privNote: 'Локально значит локально: черновики живут только в этом браузере и по тому адресу, где вы их писали. Очистка данных сайта их удалит, поэтому важное скачивайте в <code>.md</code>.',
    finalTitle: 'Начните с заголовка. Остальное приложится.', ph: 'Мы на Product Hunt ↗',
    footLabel: 'Ссылки', issues: 'Сообщить об ошибке', license: 'Лицензия MIT', author: 'Сделал Игорь Маркин',
    demo: [
      '# Немного места для идей',
      '',
      'От первой мысли до того, чем **хочется поделиться**.',
      '',
      '> Текст остаётся в этом браузере.',
      '',
      '## План на неделю',
      '',
      '- [x] Найти тихий угол',
      '- [x] Набросать черновик',
      '- [ ] Показать тем, кому важно',
      '',
      '| День | Маленький шаг |',
      '| --- | --- |',
      '| Понедельник | Собрать идеи |',
      '| Пятница | Отполировать и `отправить` |',
      ''
    ].join('\n')
  };

  const dict = { en, ru };
  const schemes = [
    ['GitHub Light', '#ffffff', '#0969da', '#1f2328'], ['GitHub Dark', '#0d1117', '#58a6ff', '#f0f6fc'],
    ['Solarized Light', '#fdf6e3', '#268bd2', '#586e75'], ['VS Code Dark+', '#1e1e1e', '#007acc', '#d4d4d4'],
    ['One Dark Pro', '#282c34', '#61afef', '#abb2bf'], ['Dracula', '#282a36', '#bd93f9', '#f8f8f2'],
    ['Catppuccin Mocha', '#1e1e2e', '#cba6f7', '#cdd6f4'], ['Tokyo Night', '#1a1b26', '#7aa2f7', '#c0caf5'],
    ['Night Owl', '#011627', '#82aaff', '#d6deeb'], ['Monokai', '#272822', '#a6e22e', '#f8f8f2'],
    ['SynthWave ’84', '#2b213a', '#ff7edb', '#f8f8f2'], ['Material Palenight', '#292d3e', '#82aaff', '#a6accd'],
    ['Kanagawa', '#1f1f28', '#7e9cd8', '#dcd7ba'], ['Rose Pine', '#191724', '#ebbcba', '#e0def4'],
    ['Ayu Dark', '#0b0e14', '#ffb454', '#b3b1ad'], ['Gruvbox Dark', '#282828', '#fabd2f', '#ebdbb2'],
    ['Everforest Dark', '#2f383e', '#a7c080', '#d3c6aa'], ['Solarized Dark', '#002b36', '#268bd2', '#839496'],
    ['Nord', '#2e3440', '#88c0d0', '#d8dee9']
  ];
  const shots = ['assets/workspace-light.webp', 'assets/workspace-dark.webp', 'assets/themes.webp'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } }
  };

  // Simplified Markdown renderer for the demo only. Escapes everything first, so no user HTML survives.
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function inline(s) {
    const codes = [];
    s = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }
  function render(src) {
    const lines = src.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (!line.trim()) { i++; continue; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(inline(lines[i++].replace(/^>\s?/, '')));
        out.push(`<blockquote><p>${buf.join('<br>')}</p></blockquote>`); continue;
      }
      if (/^\s*[-*+]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
          const t = lines[i++].replace(/^\s*[-*+]\s/, '');
          const task = t.match(/^\[([ xX])\]\s?(.*)$/);
          items.push(task
            ? `<li class="task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}><span>${inline(task[2])}</span></li>`
            : `<li>${inline(t)}</li>`);
        }
        out.push(`<ul>${items.join('')}</ul>`); continue;
      }
      if (/^\s*\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const hasHead = rows.length > 1 && /^[\s|:-]+$/.test(rows[1]);
        const head = hasHead ? `<thead><tr>${cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
        const body = rows.slice(hasHead ? 2 : 0).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
        out.push(`<table>${head}<tbody>${body}</tbody></table>`); continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*[-*+]\s|\s*\||-{3,}\s*$)/.test(lines[i])) buf.push(inline(lines[i++]));
      out.push(`<p>${buf.join('<br>')}</p>`);
    }
    return out.join('');
  }

  const src = document.getElementById('demo-src');
  const outEl = document.getElementById('demo-out');
  let edited = false;
  let typing = 0;
  const update = () => { outEl.innerHTML = render(src.value); };

  function playDemo(text) {
    window.clearTimeout(typing);
    if (reduceMotion) { src.value = text; update(); return; }
    let n = 0;
    src.value = '';
    const step = () => {
      if (edited) return;
      // Type whole Markdown markers at once so the preview never flashes broken syntax for long.
      n = Math.min(text.length, n + (text[n] === '\n' ? 1 : 2 + Math.floor(Math.random() * 3)));
      src.value = text.slice(0, n);
      update();
      if (n < text.length) typing = window.setTimeout(step, text[n - 1] === '\n' ? 90 : 26);
    };
    step();
  }

  src.addEventListener('input', () => { edited = true; window.clearTimeout(typing); update(); });
  src.addEventListener('focus', () => {
    if (edited) return;
    edited = true;
    window.clearTimeout(typing);
    src.value = dict[lang].demo;
    update();
  });

  // Language
  let lang = 'en';
  function applyLang(next, replay) {
    lang = next;
    const t = dict[lang];
    document.documentElement.lang = lang;
    document.title = t.title;
    document.querySelector('meta[name="description"]').setAttribute('content', t.description);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = t[el.dataset.i18n];
      if (v === undefined) return;
      if (v.includes('<code>')) el.innerHTML = v; else el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const v = t[el.dataset.i18nAria];
      if (v) el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    selectShot(currentShot, false);
    if (replay && !edited) playDemo(t.demo);
  }

  // Screenshot tabs
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const shotImg = document.getElementById('shot-img');
  const shotCap = document.getElementById('shot-caption');
  const shotPanel = document.getElementById('shot');
  let currentShot = 0;
  function selectShot(i, focus) {
    currentShot = i;
    const t = dict[lang];
    tabs.forEach((tab, k) => {
      tab.setAttribute('aria-selected', String(k === i));
      tab.tabIndex = k === i ? 0 : -1;
    });
    if (shotImg.getAttribute('src') !== shots[i]) shotImg.src = shots[i];
    shotImg.alt = t[`shotAlt${i}`];
    shotCap.textContent = t[`shotCap${i}`];
    shotCap.dataset.i18n = `shotCap${i}`;
    shotPanel.setAttribute('aria-labelledby', `tab-${i}`);
    if (focus) tabs[i].focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectShot(i, false));
    tab.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); selectShot((currentShot + d + tabs.length) % tabs.length, true); }
    });
  });

  // Theme swatches repaint the demo window.
  const win = document.getElementById('demo-window');
  const box = document.getElementById('swatches');
  const buttons = schemes.map(([name, bg, accent, fg], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.tabIndex = -1;
    b.innerHTML = `<span class="chip" aria-hidden="true"><i style="background:${bg}"></i><i style="background:${accent}"></i><i style="background:${fg}"></i></span><span></span>`;
    b.lastChild.textContent = name;
    b.addEventListener('click', () => pickScheme(i, false));
    box.appendChild(b);
    return b;
  });
  function pickScheme(i, focus) {
    const [, bg, accent, fg] = schemes[i];
    win.style.setProperty('--d-bg', bg);
    win.style.setProperty('--d-accent', accent);
    win.style.setProperty('--d-fg', fg);
    buttons.forEach((b, k) => { b.setAttribute('aria-checked', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    if (focus) buttons[i].focus();
  }
  box.addEventListener('keydown', (e) => {
    const cur = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const d = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 0;
    if (d) { e.preventDefault(); pickScheme((cur + d + buttons.length) % buttons.length, true); }
  });
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  buttons[dark ? 3 : 0].setAttribute('aria-checked', 'true');
  buttons[dark ? 3 : 0].tabIndex = 0;

  // Initial language: ?lang=, then the saved choice, then the browser language.
  const param = new URLSearchParams(location.search).get('lang');
  const saved = store.get('lmp-site-lang');
  const browser = (navigator.languages || [navigator.language || 'en']).some((l) => /^(ru|uk|be|kk)\b/i.test(l)) ? 'ru' : 'en';
  const initial = dict[param] ? param : dict[saved] ? saved : browser;
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
    store.set('lmp-site-lang', b.dataset.lang);
    applyLang(b.dataset.lang, true);
  }));
  if (dark) currentShot = 1;
  applyLang(initial, false);
  playDemo(dict[lang].demo);
})();
