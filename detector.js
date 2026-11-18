/*
 * detector.js — простая эвристика «похоже на ИИ».
 *
 * Никаких нейросетей и серверов: считается 6 статистических признаков текста
 * (шаблонные обороты, связки, разговорные маркеры, ритм, длина фраз, длина слов),
 * каждый переводится в 0..1 и складывается с весами.
 *
 * Это НЕ вердикт. Это подсказка «на что похож текст».
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AIDetector = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Словари                                                             */
  /* ------------------------------------------------------------------ */

  var LEX = {
    ru: {
      // Сильные шаблоны: почти всегда выдают «сгенерированный» стиль.
      // Звёздочка на конце = разрешить любое окончание.
      strong: [
        'важно отметить', 'стоит отметить', 'следует отметить', 'необходимо отметить',
        'важно подчеркнуть', 'стоит подчеркнуть', 'необходимо подчеркнуть',
        'в современном мире', 'в современном обществе',
        'играет важную роль', 'играют важную роль', 'играет ключевую роль',
        'играют ключевую роль', 'ключевую роль', 'важную роль',
        'широкий спектр', 'широкого спектра', 'широким спектром',
        'является неотъемлемой частью', 'неотъемлемой частью', 'неотъемлемая часть',
        'комплексный подход', 'комплексного подхода', 'комплексном подходе',
        'в заключение', 'таким образом', 'на сегодняшний день', 'в конечном итоге',
        'следует учитывать', 'необходимо учитывать', 'важно учитывать', 'важно понимать',
        'динамично развивающийся', 'цифровая трансформация', 'играет огромную роль',
        'следует признать', 'не секрет что', 'все большее внимание', 'все больше людей',
        'данный подход', 'данная статья', 'в данной статье', 'в данной работе',
        'данное исследование', 'представляет собой', 'является основой',
        'в условиях современной', 'не только но и', 'играет особую роль',
        'в последние годы', 'стоит обратить внимание', 'как известно',
        'следует обратить внимание', 'имеет важное значение',
        'является важным', 'играет решающую роль', 'открывает новые возможности'
      ],
      // Слабые маркеры: встречаются и у людей, но у моделей — заметно чаще.
      weak: [
        'однако', 'кроме того', 'более того', 'при этом', 'в целом',
        'следовательно', 'в свою очередь', 'в то же время', 'также',
        'соответственно', 'явля*', 'позволя*', 'обеспечива*', 'способству*',
        'представля*', 'данн*', 'эффективн*', 'оптимальн*', 'инновационн*',
        'уникальн*', 'ключев*', 'важн*', 'основн*', 'различн*', 'широк*',
        'значим*', 'комплексн*', 'в области', 'в сфере', 'в рамках',
        'на основе', 'с точки зрения', 'в условиях'
      ],
      connectors: [
        'однако', 'таким образом', 'кроме того', 'более того', 'следовательно',
        'также', 'при этом', 'в целом', 'к тому же', 'в заключение', 'итак',
        'наконец', 'во первых', 'во вторых', 'в третьих', 'поэтому',
        'в свою очередь', 'в то же время', 'на сегодняшний день',
        'соответственно', 'иными словами', 'другими словами', 'прежде всего',
        'в первую очередь', 'в частности', 'помимо этого', 'исходя из этого'
      ],
      informal: [
        'лол', 'блин', 'короче', 'вообще', 'как то', 'что то', 'очень',
        'просто', 'вот', 'хаха', 'круто', 'норм', 'ваще', 'пипец', 'капец',
        'походу', 'типа', 'кстати', 'реально', 'жесть', 'мда', 'упс', 'ага',
        'тупо', 'дурацк*', 'фигня', 'ерунда', 'ладно', 'если честно',
        'честно говоря', 'полдня', 'вроде', 'прикольно', 'офигеть', 'щас',
        'чел', 'ребята', 'увы', 'эх', 'ой', 'блин*', 'как бы', 'ну да',
        'по ходу', 'нафиг', 'нахрен', 'зато', 'всё равно', 'все равно'
      ]
    },
    en: {
      strong: [
        "it is important to note", "it is worth noting", "it is crucial to",
        "in today's fast paced world", 'ever evolving', 'delve into',
        'plays a crucial role', 'plays a vital role', 'a wide range of',
        'a myriad of', 'when it comes to', 'in conclusion', 'in summary',
        'a testament to', 'navigating the', 'rich tapestry', 'underscores the',
        'paramount', 'multifaceted', 'cutting edge', 'game changer',
        'unlock the', 'harness the', 'embark on', 'in the realm of',
        'at the end of the day', 'a significant impact', 'it is essential to',
        'in an ever changing', 'the landscape of', 'a pivotal role',
        'seamless integration', 'dive deep into', 'in order to',
        'plays a key role', 'it is important to understand'
      ],
      weak: [
        'moreover', 'furthermore', 'additionally', 'however', 'therefore',
        'thus', 'overall', 'consequently', 'nevertheless', 'notably',
        'crucial', 'vital', 'robust', 'seamless', 'comprehensive', 'leverage',
        'foster', 'elevate', 'profound', 'meticulous', 'pivotal', 'landscape',
        'realm', 'significant', 'various', 'numerous', 'ultimately',
        'effectively', 'enhance', 'ensure', 'diverse', 'innovative', 'optimal',
        'key', 'essential', 'fundamental', 'transformative'
      ],
      connectors: [
        'moreover', 'furthermore', 'additionally', 'however', 'therefore',
        'thus', 'overall', 'consequently', 'nevertheless', 'notably',
        'firstly', 'secondly', 'thirdly', 'finally', 'in conclusion',
        'in summary', 'ultimately', 'meanwhile', 'similarly', 'conversely',
        'nonetheless', 'besides', 'hence', 'in addition', 'on the other hand',
        'as a result', 'for instance', 'indeed', 'in other words'
      ],
      informal: [
        'lol', 'omg', 'kinda', 'gonna', 'wanna', 'yeah', 'nope', 'cool',
        'stuff', 'a lot of', 'pretty much', 'i think', 'i guess', 'you know',
        'honestly', 'basically', 'actually', 'really', 'anyway', 'okay',
        'haha', 'totally', 'sort of', 'oh well', 'whatever', 'dude',
        'guys', 'freaking', 'weird', 'mess', 'anyways'
      ]
    }
  };

  var EXAMPLES = {
    ai:
      'В современном мире искусственный интеллект играет важную роль во многих сферах жизни. ' +
      'Важно отметить, что технологии машинного обучения позволяют обрабатывать огромные объёмы данных ' +
      'и находить закономерности, которые человеку заметить сложно. Кроме того, нейросети обеспечивают ' +
      'широкий спектр возможностей для бизнеса: от автоматизации рутинных задач до создания ' +
      'персонализированных рекомендаций. Таким образом, внедрение ИИ является ключевым фактором ' +
      'конкурентоспособности современных компаний. В заключение следует подчеркнуть, что комплексный ' +
      'подход к цифровой трансформации позволяет достичь оптимальных результатов и повысить ' +
      'эффективность процессов.',
    human:
      'Вчера зашёл в кофейню у дома — ту самую, где бариста вечно путает заказы. Взял капучино, ' +
      'сел у окна. Дождь стучал по стеклу, кто-то за соседним столиком громко спорил про политику. ' +
      'Я достал блокнот и полчаса тупо смотрел на пустую страницу. Потом вспомнил, что обещал ' +
      'Серёге помочь с его дурацким сайтом, и настроение испортилось окончательно. Домой шёл пешком, ' +
      'промок насквозь, зато придумал, как переделать тот кусок с авторизацией. Смешно, но именно ' +
      'в такие моменты в голову лезет что-то нормальное.'
  };

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                             */
  /* ------------------------------------------------------------------ */

  var WORD_RE = /[A-Za-zА-Яа-яЁё0-9]+(?:['’-][A-Za-zА-Яа-яЁё0-9]+)*/g;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function rising(v, lo, hi) { return hi <= lo ? 0 : clamp01((v - lo) / (hi - lo)); }
  function falling(v, lo, hi) { return hi <= lo ? 0 : clamp01((hi - v) / (hi - lo)); }

  function words(text) {
    var m = text.match(WORD_RE);
    return m ? m : [];
  }

  function splitSentences(text) {
    // Точки в сокращениях не должны рвать предложение
    var guard = text.replace(
      /(^|[\s(])(т\.\s?д|т\.\s?е|т\.\s?п|т\.\s?к|и\s?т\.\s?д|др|г|гг|рис|табл|см|шт|млн|млрд|e\.g|i\.e|etc|vs|mr|ms|dr|prof|fig|approx)\./gi,
      function (m) { return m.replace(/\./g, '\u0001'); }
    );
    var parts = guard.split(/(?<=[.!?…]+)\s+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/\u0001/g, '.').trim();
      if (s) out.push(s);
    }
    return out;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Фраза -> регулярка: нестрогие разделители внутри, границы слова по краям,
  // звёздочка на конце включает любое окончание.
  function phraseRegex(phrase) {
    var stem = false;
    if (phrase.charAt(phrase.length - 1) === '*') {
      stem = true;
      phrase = phrase.slice(0, -1);
    }
    var parts = phrase.split(' ').map(escapeRe);
    var tail = stem ? '[а-яё]{0,4}' : '';
    return new RegExp(
      '(?<![a-zа-яё0-9])' + parts.join('[^a-zа-яё0-9]+') + tail + '(?![a-zа-яё0-9])',
      'giu'
    );
  }

  function buildPatterns(list, strength) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      out.push({
        re: phraseRegex(list[i]),
        strength: strength,
        phrase: list[i].replace(/\*$/, '')
      });
    }
    return out;
  }

  // Все совпадения шаблонных фраз; слабые внутри сильных не считаем дважды
  function collectMarkers(text, patterns) {
    var found = [];
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      var re = p.re;
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        found.push({
          start: m.index,
          end: m.index + m[0].length,
          phrase: p.phrase,
          strength: p.strength,
          text: m[0]
        });
      }
    }
    found.sort(function (a, b) { return a.start - b.start || b.end - a.end; });

    var result = [];
    for (var k = 0; k < found.length; k++) {
      var cur = found[k];
      if (cur.strength === 'weak') {
        var covered = false;
        for (var j = 0; j < found.length; j++) {
          var o = found[j];
          if (o.strength !== 'strong') continue;
          if (o.start <= cur.start && o.end >= cur.end) { covered = true; break; }
        }
        if (covered) continue;
      }
      var overlap = false;
      for (var r = 0; r < result.length; r++) {
        if (cur.start < result[r].end && cur.end > result[r].start) { overlap = true; break; }
      }
      if (!overlap) result.push(cur);
    }
    return result;
  }

  function countPatterns(text, patterns) {
    var n = 0;
    for (var i = 0; i < patterns.length; i++) {
      var re = patterns[i].re;
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        n++;
      }
    }
    return n;
  }

  function stdev(arr, mean) {
    if (arr.length < 2) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i] - mean;
      sum += d * d;
    }
    return Math.sqrt(sum / arr.length);
  }

  function startsWithConnector(sentence, connectors) {
    var w = words(sentence.toLowerCase().replace(/ё/g, 'е'));
    if (!w.length) return false;
    var joined = w.join(' ');
    for (var i = 0; i < connectors.length; i++) {
      if (joined.indexOf(connectors[i]) === 0) {
        var rest = joined.charAt(connectors[i].length);
        if (rest === '' || rest === ' ') return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Основной разбор                                                     */
  /* ------------------------------------------------------------------ */

  function analyze(raw) {
    var text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n');
    var trimmed = text.trim();
    var allWords = words(trimmed);

    if (allWords.length < 8) {
      return {
        ok: false,
        error: 'Слишком короткий текст. Нужно минимум 8 слов — на меньшем фрагменте оценка бессмысленна.'
      };
    }

    var cyr = (trimmed.match(/[А-Яа-яЁё]/g) || []).length;
    var lat = (trimmed.match(/[A-Za-z]/g) || []).length;
    var lang = cyr >= lat ? 'ru' : 'en';
    var lex = LEX[lang];

    var sentences = splitSentences(trimmed);
    if (!sentences.length) sentences = [trimmed];

    var lens = sentences.map(function (s) { return words(s).length; });
    var total = allWords.length;
    var mean = total / sentences.length;
    var cv = mean > 0 ? stdev(lens, mean) / mean : 0;

    // ---- 1. Шаблонные обороты ----
    var clichePatterns = buildPatterns(lex.strong, 'strong').concat(buildPatterns(lex.weak, 'weak'));
    var markers = collectMarkers(trimmed, clichePatterns);
    var strongCount = 0, weakCount = 0;
    for (var mi = 0; mi < markers.length; mi++) {
      if (markers[mi].strength === 'strong') strongCount++; else weakCount++;
    }
    var markerDensity = (100 * (strongCount + 0.45 * weakCount)) / total;
    var sCliche = rising(markerDensity, 0.2, 3.0);

    // ---- 2. Связки в начале предложений ----
    var connSentences = 0;
    for (var si = 0; si < sentences.length; si++) {
      if (startsWithConnector(sentences[si], lex.connectors)) connSentences++;
    }
    var connShare = connSentences / sentences.length;
    var sConn = rising(connShare, 0.05, 0.55);

    // ---- 3. Разговорные маркеры (антоним «машинности») ----
    var informalPatterns = buildPatterns(lex.informal, 'informal');
    var informalHits = countPatterns(trimmed, informalPatterns);
    informalHits += (trimmed.match(/!+/g) || []).length * 0.7;
    informalHits += (trimmed.match(/\)\)+/g) || []).length;
    informalHits += (trimmed.match(/\.\.\./g) || []).length * 0.5;
    var emoji = trimmed.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
    if (emoji) informalHits += emoji.length * 1.5;
    var informalDensity = (100 * informalHits) / total;
    var sInformal = falling(informalDensity, 0, 2.0);

    // ---- 4. Ритм: разброс длин + «выбивающиеся» фразы ----
    var extremes = 0;
    for (var ei = 0; ei < lens.length; ei++) {
      if (lens[ei] <= 6 || lens[ei] >= mean * 1.6) extremes++;
    }
    var exShare = extremes / lens.length;
    var sRhythm;
    if (sentences.length < 3) {
      sRhythm = 0.5; // мало фраз — ритм ничего не говорит
    } else {
      sRhythm = 0.4 * falling(cv, 0.30, 0.72) + 0.6 * falling(exShare, 0.02, 0.45);
    }

    // ---- 5. Средняя длина предложения ----
    var sLen = rising(mean, 9, 26);

    // ---- 6. Длинные слова ----
    var longWords = 0;
    for (var wi = 0; wi < total; wi++) {
      if (allWords[wi].length >= 9) longWords++;
    }
    var longRatio = longWords / total;
    var sLong = rising(longRatio, 0.10, 0.34);

    var signals = [
      {
        id: 'cliches', label: 'Шаблонные обороты', weight: 0.28, score: sCliche,
        hint: strongCount + ' сильных и ' + weakCount + ' слабых на ' + total + ' слов'
      },
      {
        id: 'connectors', label: 'Связки в начале фраз', weight: 0.19, score: sConn,
        hint: Math.round(connShare * 100) + '% предложений начинаются со связки'
      },
      {
        id: 'informal', label: 'Разговорные маркеры', weight: 0.17, score: sInformal,
        hint: informalHits === 0
          ? 'ни одной живой речевой вставки'
          : informalHits + ' шт., ' + informalDensity.toFixed(1) + ' на 100 слов'
      },
      {
        id: 'rhythm', label: 'Ритм текста', weight: 0.17, score: sRhythm,
        hint: 'разброс ' + cv.toFixed(2) + ', выбивающихся фраз ' + Math.round(exShare * 100) + '%'
      },
      {
        id: 'avgLength', label: 'Длина фразы', weight: 0.09, score: sLen,
        hint: mean.toFixed(1) + ' слов в среднем на предложение'
      },
      {
        id: 'longWords', label: 'Длинные слова', weight: 0.10, score: sLong,
        hint: Math.round(longRatio * 100) + '% слов длиннее 8 символов'
      }
    ];

    var p = 0;
    for (var s = 0; s < signals.length; s++) p += signals[s].weight * signals[s].score;

    var percent = Math.min(97, Math.round(100 * clamp01((p - 0.10) / 0.85)));

    var scores = signals.map(function (x) { return x.score; });
    var sMean = scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
    var spread = stdev(scores, sMean);
    var agreement = 1 - clamp01(spread / 0.5);
    var lenFactor = total < 30 ? 0.3 : total < 60 ? 0.55 : total < 120 ? 0.78 : 0.9;
    var evidence = clamp01(strongCount / 4);
    var confidence = Math.round(100 * clamp01(
      0.55 * lenFactor + 0.25 * evidence + 0.20 * agreement
    ));

    // Подсветка: какие фразы подозрительны
    var sentenceData = sentences.map(function (sent) {
      var local = collectMarkers(sent, clichePatterns);
      var len = words(sent).length;
      var hitStrong = 0, hitWeak = 0;
      for (var q = 0; q < local.length; q++) {
        if (local[q].strength === 'strong') hitStrong++; else hitWeak++;
      }
      var sc = clamp01(
        0.55 * Math.min(1, hitStrong / 2 + hitWeak / 4) +
        0.30 * (startsWithConnector(sent, lex.connectors) ? 1 : 0) +
        0.15 * (len >= 25 ? 1 : 0)
      );
      return {
        text: sent,
        score: sc,
        level: sc >= 0.55 ? 3 : sc >= 0.3 ? 2 : sc > 0 ? 1 : 0,
        words: len,
        matches: local.map(function (mm) { return [mm.start, mm.end]; })
      };
    });

    // Сводка найденных шаблонов
    var counter = {};
    for (var mc = 0; mc < markers.length; mc++) {
      var ph = markers[mc].phrase;
      counter[ph] = (counter[ph] || 0) + 1;
    }
    var foundPhrases = Object.keys(counter).map(function (k) {
      return { phrase: k, count: counter[k] };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 12);

    var paragraphs = trimmed.split(/\n\s*\n/).filter(function (x) { return x.trim(); }).length;

    return {
      ok: true,
      lang: lang,
      percent: percent,
      confidence: confidence,
      verdict: verdictFor(percent),
      signals: signals,
      sentences: sentenceData,
      foundPhrases: foundPhrases,
      stats: {
        chars: trimmed.length,
        charsNoSpaces: trimmed.replace(/\s/g, '').length,
        words: total,
        unique: new Set(allWords.map(function (w) { return w.toLowerCase(); })).size,
        sentences: sentences.length,
        paragraphs: paragraphs,
        avgSentence: mean,
        readingMin: Math.max(1, Math.round(total / 180))
      }
    };
  }

  function verdictFor(p) {
    if (p < 30) {
      return {
        key: 'human',
        label: 'Скорее написал человек',
        color: '#34d399',
        desc: 'Неровный ритм, живые обороты и почти нет шаблонных конструкций — типично для ручного текста.'
      };
    }
    if (p < 55) {
      return {
        key: 'mixed',
        label: 'Смешанные признаки',
        color: '#fbbf24',
        desc: 'Однозначного вывода нет: так выглядит и текст, который правили руками, и строгий формальный стиль.'
      };
    }
    if (p < 75) {
      return {
        key: 'likely-ai',
        label: 'Похоже на ИИ',
        color: '#fb923c',
        desc: 'Много ровных конструкций и типичных для языковых моделей оборотов. Похоже на генерацию с лёгкой правкой.'
      };
    }
    return {
      key: 'ai',
      label: 'С большой вероятностью ИИ',
      color: '#f87171',
      desc: 'Сильные маркеры машинного стиля почти по всем признакам: ровный ритм, связки, штампы.'
    };
  }

  return {
    version: '1.0.0',
    analyze: analyze,
    EXAMPLES: EXAMPLES
  };
});
