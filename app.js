/* app.js — вся логика страницы: ввод, разбор, отрисовка, история */
(function () {
  'use strict';

  var D = window.AIDetector;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var textEl = $('#text');
  var wordCount = $('#wordCount');
  var charCount = $('#charCount');
  var readTime = $('#readTime');
  var analyzeBtn = $('#analyzeBtn');
  var resultEl = $('#result');
  var historyBlock = $('#historyBlock');
  var historyList = $('#historyList');

  var DRAFT_KEY = 'aiDetector.draft.v1';
  var HIST_KEY = 'aiDetector.history.v1';
  var CIRC = 2 * Math.PI * 84;

  /* ---------------------------------------------------------------- */
  /*  Мелкие утилиты                                                   */
  /* ---------------------------------------------------------------- */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scoreColor(v) {
    if (v >= 0.66) return '#f87171';
    if (v >= 0.4) return '#fb923c';
    if (v >= 0.2) return '#fbbf24';
    return '#34d399';
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return hh + ':' + mm;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + hh + ':' + mm;
  }

  function animateNumber(el, to, duration) {
    var start = performance.now();
    function frame(t) {
      var k = Math.min(1, Math.max(0, (t - start) / duration));
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * Math.min(1, Math.max(0, eased)));
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // страховка: даже если rAF не дошёл до конца, показать точное значение
    setTimeout(function () { el.textContent = to; }, duration + 80);
  }

  /* ---------------------------------------------------------------- */
  /*  Счётчики и черновик                                              */
  /* ---------------------------------------------------------------- */

  function countWords(text) {
    var m = text.match(/[A-Za-zА-Яа-яЁё0-9]+(?:['’-][A-Za-zА-Яа-яЁё0-9]+)*/g);
    return m ? m.length : 0;
  }

  function updateCounters() {
    var text = textEl.value;
    var words = countWords(text);
    wordCount.textContent = words;
    charCount.textContent = text.length;
    readTime.textContent = words ? Math.max(1, Math.round(words / 180)) : 0;
  }

  var draftTimer = null;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try {
        if (textEl.value.trim()) localStorage.setItem(DRAFT_KEY, textEl.value);
        else localStorage.removeItem(DRAFT_KEY);
      } catch (e) { /* приватный режим — молча живём без черновика */ }
    }, 350);
  }

  /* ---------------------------------------------------------------- */
  /*  Отрисовка результата                                             */
  /* ---------------------------------------------------------------- */

  function sentenceHtml(s) {
    var out = '';
    var last = 0;
    var ms = s.matches.slice().sort(function (a, b) { return a[0] - b[0]; });
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m[0] < last) continue;
      out += esc(s.text.slice(last, m[0]));
      out += '<mark>' + esc(s.text.slice(m[0], m[1])) + '</mark>';
      last = m[1];
    }
    out += esc(s.text.slice(last));
    return out;
  }

  function renderError(msg) {
    resultEl.hidden = false;
    resultEl.innerHTML = '<div class="card notice"><strong>Не получилось</strong><p>' + esc(msg) + '</p></div>';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderResult(r) {
    var v = r.verdict;
    var p = r.percent;

    var langLabel = r.lang === 'ru' ? 'русский' : 'английский';

    var statChips =
      '<span class="stat">слов<b>' + r.stats.words + '</b></span>' +
      '<span class="stat">предложений<b>' + r.stats.sentences + '</b></span>' +
      '<span class="stat">уникальных слов<b>' + r.stats.unique + '</b></span>' +
      '<span class="stat">язык<b>' + langLabel + '</b></span>';

    var signalsHtml = r.signals.map(function (s) {
      var val = Math.round(s.score * 100);
      return (
        '<div class="signal">' +
        '<div class="signal-top"><span>' + esc(s.label) + '</span><b>' + val + '%</b></div>' +
        '<div class="signal-bar"><i data-w="' + val + '" style="background:' + scoreColor(s.score) + '"></i></div>' +
        '<small>' + esc(s.hint) + '</small>' +
        '</div>'
      );
    }).join('');

    var shown = r.sentences.slice(0, 60);
    var markedHtml = shown.map(function (s) {
      return '<span class="sent s' + s.level + '">' + sentenceHtml(s) + '</span> ';
    }).join('');
    if (r.sentences.length > shown.length) {
      markedHtml += '<p class="empty-note">…показаны первые ' + shown.length + ' предложений</p>';
    }

    var markersHtml = r.foundPhrases.length
      ? r.foundPhrases.map(function (f) {
          return '<span class="marker">' + esc(f.phrase) + (f.count > 1 ? '<em>×' + f.count + '</em>' : '') + '</span>';
        }).join('')
      : '<p class="empty-note">Шаблонных оборотов не найдено — хороший знак.</p>';

    var lowConf = r.confidence < 40
      ? '<p class="empty-note" style="margin-top:10px">Мало данных: текст короткий или признаки разнородные, вывод ориентировочный.</p>'
      : '';

    resultEl.hidden = false;
    resultEl.innerHTML =
      '<div class="card score-card">' +
        '<div class="gauge-wrap">' +
          '<svg class="gauge" viewBox="0 0 200 200" aria-hidden="true">' +
            '<circle class="gauge-track" cx="100" cy="100" r="84"></circle>' +
            '<circle class="gauge-fill" id="gaugeFill" cx="100" cy="100" r="84" ' +
              'stroke-dasharray="' + CIRC.toFixed(2) + '" stroke-dashoffset="' + CIRC.toFixed(2) + '"></circle>' +
          '</svg>' +
          '<div class="gauge-center">' +
            '<div class="gauge-num"><span id="scoreNum">0</span><span class="unit">%</span></div>' +
            '<div class="gauge-cap">ИИ-подобность</div>' +
          '</div>' +
        '</div>' +
        '<div class="score-body">' +
          '<div class="verdict">' +
            '<span class="dot" style="background:' + v.color + ';box-shadow:0 0 0 4px ' + hexA(v.color, 0.18) + '"></span>' +
            '<h2>' + esc(v.label) + '</h2>' +
          '</div>' +
          '<p class="verdict-desc">' + esc(v.desc) + '</p>' +
          '<div class="stat-chips">' + statChips + '</div>' +
          '<div class="conf-row">' +
            '<span>Уверенность</span>' +
            '<span class="conf-bar"><i id="confFill" data-w="' + r.confidence + '"></i></span>' +
            '<span class="conf-val">' + r.confidence + '%</span>' +
          '</div>' +
          lowConf +
        '</div>' +
      '</div>' +

      '<div class="grid2">' +
        '<div class="card">' +
          '<h3>Из чего сложилась оценка</h3>' +
          '<div class="signals">' + signalsHtml + '</div>' +
          '<div class="markers">' + markersHtml + '</div>' +
        '</div>' +
        '<div class="card">' +
          '<h3>Где текст выглядит «гладко»</h3>' +
          '<p class="hint">Подсвечены шаблонные фразы; фон — общая подозрительность предложения.</p>' +
          '<div class="marked">' + markedHtml + '</div>' +
          '<div class="legend">' +
            '<span><i style="background:rgba(248,113,113,.5)"></i> шаблон</span>' +
            '<span><i style="background:rgba(248,113,113,.2)"></i> сильное</span>' +
            '<span><i style="background:rgba(251,146,60,.2)"></i> среднее</span>' +
            '<span><i style="background:rgba(251,191,36,.12)"></i> слабое</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    var fill = $('#gaugeFill');
    var num = $('#scoreNum');
    var conf = $('#confFill');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (fill) {
          fill.style.stroke = v.color;
          fill.style.strokeDashoffset = (CIRC * (1 - p / 100)).toFixed(2);
        }
        if (conf) conf.style.width = r.confidence + '%';
        var bars = resultEl.querySelectorAll('.signal-bar i');
        for (var i = 0; i < bars.length; i++) {
          bars[i].style.width = bars[i].getAttribute('data-w') + '%';
        }
      });
    });

    if (num) animateNumber(num, p, 900);

    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return r;
  }

  function hexA(hex, alpha) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  /* ---------------------------------------------------------------- */
  /*  История                                                          */
  /* ---------------------------------------------------------------- */

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HIST_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(list) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* ignore */ }
  }

  function addHistory(r, text) {
    var list = loadHistory();
    list.unshift({
      time: Date.now(),
      percent: r.percent,
      color: r.verdict.color,
      label: r.verdict.label,
      text: text.slice(0, 6000)
    });
    saveHistory(list);
    renderHistory();
  }

  function renderHistory() {
    var list = loadHistory();
    if (!list.length) {
      historyBlock.hidden = true;
      historyList.innerHTML = '';
      return;
    }
    historyBlock.hidden = false;
    historyList.innerHTML = list.map(function (item, i) {
      return (
        '<button type="button" class="history-item" data-i="' + i + '">' +
          '<span class="history-score" style="background:' + item.color + '">' + item.percent + '%</span>' +
          '<span class="history-preview">' + esc(item.text.replace(/\s+/g, ' ').slice(0, 110)) + '</span>' +
          '<span class="history-time">' + fmtTime(item.time) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  /* ---------------------------------------------------------------- */
  /*  Запуск анализа                                                   */
  /* ---------------------------------------------------------------- */

  var busy = false;

  function analyze() {
    if (busy) return;
    var text = textEl.value;

    if (!text.trim()) {
      renderError('Сначала вставьте текст — проверять пока нечего.');
      return;
    }

    var probe = D.analyze(text);
    if (!probe.ok) {
      renderError(probe.error);
      return;
    }

    busy = true;
    analyzeBtn.disabled = true;
    analyzeBtn.querySelector('.btn-label').textContent = 'Считаю…';

    setTimeout(function () {
      renderResult(probe);
      addHistory(probe, text);
      busy = false;
      analyzeBtn.disabled = false;
      analyzeBtn.querySelector('.btn-label').textContent = 'Проверить';
    }, 420);
  }

  /* ---------------------------------------------------------------- */
  /*  Обработчики                                                      */
  /* ---------------------------------------------------------------- */

  textEl.addEventListener('input', function () {
    updateCounters();
    saveDraft();
  });

  analyzeBtn.addEventListener('click', analyze);

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      analyze();
    }
  });

  var sampleButtons = document.querySelectorAll('[data-sample]');
  for (var i = 0; i < sampleButtons.length; i++) {
    sampleButtons[i].addEventListener('click', function () {
      var kind = this.getAttribute('data-sample');
      textEl.value = D.EXAMPLES[kind] || '';
      updateCounters();
      saveDraft();
      textEl.focus();
      analyze();
    });
  }

  $('#clearBtn').addEventListener('click', function () {
    textEl.value = '';
    updateCounters();
    saveDraft();
    resultEl.hidden = true;
    resultEl.innerHTML = '';
    textEl.focus();
  });

  $('#clearHistory').addEventListener('click', function () {
    saveHistory([]);
    renderHistory();
  });

  historyList.addEventListener('click', function (e) {
    var btn = e.target.closest('.history-item');
    if (!btn) return;
    var idx = Number(btn.getAttribute('data-i'));
    var list = loadHistory();
    var item = list[idx];
    if (!item) return;
    textEl.value = item.text;
    updateCounters();
    saveDraft();
    analyze();
  });

  /* ---------------------------------------------------------------- */
  /*  Инициализация                                                    */
  /* ---------------------------------------------------------------- */

  try {
    var draft = localStorage.getItem(DRAFT_KEY);
    if (draft) textEl.value = draft;
  } catch (e) { /* ignore */ }

  updateCounters();
  renderHistory();
})();
