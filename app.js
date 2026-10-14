(() => {
  'use strict';
  const BANK = window.QUESTION_BANK;
  const KEY = 'csu-military-theory-2026-500-v1';
  const $ = id => document.getElementById(id);
  const typeNames = { single: '单选题', multiple: '多选题', boolean: '判断题' };
  const questions = new Map((BANK?.questions || []).map(q => [q.id, q]));
  const allIds = [...questions.keys()];
  const categories = [...new Set([...questions.values()].map(q => q.category))];
  const normalizeScope = scope => ({ category: categories.includes(scope?.category) ? scope.category : 'all', type: ['single','multiple','boolean'].includes(scope?.type) ? scope.type : 'all' });
  const filteredIds = scope => allIds.filter(id => { const q = questions.get(id); return (scope.category === 'all' || q.category === scope.category) && (scope.type === 'all' || q.type === scope.type); });
  const grade = (q, selected) => {
    const actual = [...new Set(selected)].sort();
    const expected = [...q.answers].sort();
    return actual.length === expected.length && actual.every((id, i) => id === expected[i]);
  };
  const summarize = session => {
    const answers = session.ids.map(id => session.answers[id]).filter(a => a?.graded);
    const correct = answers.filter(a => a.correct).length;
    return { submitted: answers.length, correct, total: session.ids.length, wrong: answers.length - correct,
      rate: answers.length ? Math.round(correct / answers.length * 100) : null };
  };
  window.QuizCore = Object.freeze({ grade, summarize });
  if (!BANK || !allIds.length) {
    $('source-note').textContent = '题库未加载，请重新打开网页。';
    $('question-title').textContent = '暂时无法加载题目';
    return;
  }
  const shuffle = items => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const makeSession = (mode, wrong = {}, inputScope = {}) => {
    const scope = normalizeScope(inputScope);
    const pool = filteredIds(scope);
    return { mode, scope, ids: mode === 'wrong' ? pool.filter(id => wrong[id]) : mode === 'random' ? shuffle(pool) : pool,
      cursor: 0, answers: {}, startedAt: Date.now() };
  };
  const freshState = () => ({ schema: 1, bankVersion: BANK.version, wrong: {}, overall: { submitted: 0, correct: 0 }, session: makeSession('ordered') });
  let storageAvailable = true;
  const loadState = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return freshState();
      const saved = JSON.parse(raw);
      if (saved.schema !== 1 || saved.bankVersion !== BANK.version || !saved.session) return freshState();
      const s = saved.session;
      const scope = normalizeScope(s.scope);
      const scopeIds = filteredIds(scope);
      if (!['ordered', 'random', 'wrong'].includes(s.mode) || !Array.isArray(s.ids) ||
          s.ids.some(id => !questions.has(id) || !scopeIds.includes(id)) || new Set(s.ids).size !== s.ids.length ||
          (s.mode !== 'wrong' && s.ids.length !== scopeIds.length)) return freshState();
      const clean = freshState();
      clean.session = { ...makeSession(s.mode, {}, scope), ids: s.ids,
        cursor: Math.min(Math.max(Number.isInteger(s.cursor) ? s.cursor : 0, 0), Math.max(s.ids.length - 1, 0)),
        answers: {}, startedAt: Number.isFinite(s.startedAt) ? s.startedAt : Date.now() };
      for (const id of s.ids) {
        const a = s.answers?.[id];
        const q = questions.get(id);
        if (!a || !Array.isArray(a.selected) || a.selected.some(o => !q.options.some(x => x.id === o))) continue;
        const selected = [...new Set(a.selected)];
        if (q.type !== 'multiple' && selected.length > 1) continue;
        clean.session.answers[id] = { selected, graded: a.graded === true && selected.length > 0,
          correct: a.graded === true && selected.length > 0 && grade(q, selected) };
      }
      for (const id of allIds) {
        if (saved.wrong?.[id]) clean.wrong[id] = { misses: Math.max(1, Math.floor(Number(saved.wrong[id].misses) || 1)) };
      }
      const submitted = Math.max(0, Math.floor(Number(saved.overall?.submitted) || 0));
      clean.overall = { submitted, correct: Math.min(submitted, Math.max(0, Math.floor(Number(saved.overall?.correct) || 0))) };
      return clean;
    } catch (error) {
      if (error.name !== 'SyntaxError') storageAvailable = false;
      return freshState();
    }
  };
  let state = loadState();
  let view = 'question';
  let pendingMode = null;
  let pendingScope = null;
  let toastTimer;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
    $('storage-warning').hidden = storageAvailable;
  };
  const notify = message => {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
  };
  const currentQuestion = () => questions.get(state.session.ids[state.session.cursor]);
  const makeText = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  };
  const select = optionId => {
    const q = currentQuestion();
    const old = state.session.answers[q.id];
    if (old?.graded) return;
    let selected = old?.selected || [];
    if (q.type === 'multiple') {
      selected = selected.includes(optionId) ? selected.filter(id => id !== optionId) : [...selected, optionId];
      state.session.answers[q.id] = { selected, graded: false, correct: false };
      save();
      renderQuestion();
      renderNavigation();
      const button = $('options').querySelector(`[data-option="${optionId}"]`);
      button?.focus({ preventScroll: true });
    } else {
      state.session.answers[q.id] = { selected: [optionId], graded: false, correct: false };
      submit();
    }
  };
  const submit = () => {
    const q = currentQuestion();
    const a = q && state.session.answers[q.id];
    if (!a || a.graded || !a.selected.length) return;
    a.graded = true;
    a.correct = grade(q, a.selected);
    state.overall.submitted++;
    if (a.correct) {
      state.overall.correct++;
      delete state.wrong[q.id];
    } else {
      state.wrong[q.id] = { misses: (state.wrong[q.id]?.misses || 0) + 1 };
    }
    save();
    render();
    $('next').focus({ preventScroll: true });
  };
  const renderStats = () => {
    const stats = summarize(state.session);
    const wrongCount = Object.keys(state.wrong).length;
    $('scope-status').textContent = '当前范围：' + (state.session.scope.category === 'all' ? '全部章节' : state.session.scope.category) + ' · ' + (state.session.scope.type === 'all' ? '全部题型' : typeNames[state.session.scope.type]) + ' · ' + stats.total + ' 题';
    $('stat-progress').textContent = `${stats.submitted} / ${stats.total}`;
    $('stat-correct').textContent = stats.correct;
    $('stat-rate').textContent = stats.rate === null ? '—' : `${stats.rate}%`;
    $('stat-wrong').textContent = wrongCount;
    $('mode-wrong-count').textContent = wrongCount;
    $('aside-wrong').textContent = `${wrongCount} 道待复习`;
    $('progress-fill').style.width = `${stats.total ? stats.submitted / stats.total * 100 : 0}%`;
    $('round-progress').setAttribute('aria-valuemax', stats.total);
    $('round-progress').setAttribute('aria-valuenow', stats.submitted);
    for (const mode of ['ordered', 'random', 'wrong']) {
      $('mode-' + mode).classList.toggle('active', state.session.mode === mode);
      $('mode-' + mode).setAttribute('aria-pressed', String(state.session.mode === mode));
    }
  };
  const renderQuestion = () => {
    const q = currentQuestion();
    if (!q) return;
    const a = state.session.answers[q.id] || { selected: [], graded: false };
    $('type-tag').textContent = typeNames[q.type];
    $('question-number').textContent = `本轮 ${state.session.cursor + 1} / ${state.session.ids.length} · 原题 ${q.number}`;
    $('question-category').textContent = q.category;
    $('question-title').textContent = q.title;
    $('question-tip').textContent = q.type === 'multiple' ? '可选多个答案。全部选对、无漏选或多选才得分。' : '点选一个答案，即可查看判分和解析。';
    $('options').replaceChildren();
    for (const option of q.options) {
      const selected = a.selected.includes(option.id);
      const isAnswer = q.answers.includes(option.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option';
      button.dataset.option = option.id;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = a.graded;
      if (selected) button.classList.add('selected');
      if (a.graded && isAnswer) button.classList.add('correct');
      if (a.graded && selected && !isAnswer) button.classList.add('wrong');
      button.append(makeText('span', 'option-letter', option.id), makeText('span', 'option-text', option.text));
      const status = a.graded ? isAnswer ? '✓' : selected ? '✕' : '' : selected ? '✓' : '';
      button.setAttribute('aria-label', option.id + '. ' + option.text + (a.graded ? isAnswer ? '，正确答案' : selected ? '，所选错误答案' : '' : selected ? '，已选择' : ''));
      button.append(makeText('span', 'option-status', status));
      button.addEventListener('click', () => select(option.id));
      $('options').append(button);
    }
    $('submit').hidden = q.type !== 'multiple' || a.graded;
    $('submit').disabled = !a.selected.length;
    $('feedback').hidden = !a.graded;
    $('feedback').className = `feedback ${a.correct ? 'good' : 'bad'}`;
    $('feedback').replaceChildren();
    if (a.graded) {
      $('feedback').append(makeText('h3', 'feedback-title', a.correct ? '答对了，继续保持！' : '这题已加入错题本'));
      const answerText = q.options.filter(o => q.answers.includes(o.id)).map(o => `${o.id}. ${o.text}`).join('；');
      $('feedback').append(makeText('p', 'answer-line', `正确答案：${answerText}`),
        makeText('p', 'explanation', q.explanation), makeText('p', 'source-line', `来源：题库第 ${q.sourcePages?.length > 1 ? q.sourcePages[0] + '–' + q.sourcePages[q.sourcePages.length - 1] : q.sourcePage} 页 · 原题 ${q.number}`));
    }
    $('prev').disabled = state.session.cursor === 0;
    $('next').textContent = state.session.cursor === state.session.ids.length - 1 ? '查看本轮成绩' : a.graded ? '下一题 →' : '暂时跳过 →';
  };
  const renderNavigation = () => {
    $('question-grid').replaceChildren();
    const stats = summarize(state.session);
    $('navigator-count').textContent = `${stats.submitted}/${stats.total}`;
    state.session.ids.forEach((id, index) => {
      const a = state.session.answers[id];
      const button = makeText('button', 'question-dot', String(questions.get(id).number).padStart(3, '0'));
      button.type = 'button';
      const status = a?.graded ? a.correct ? '答对' : '答错' : a?.selected.length ? '已选择，未提交' : '未答';
      button.setAttribute('aria-label', `原题第 ${questions.get(id).number} 题，${status}`);
      if (a?.graded) button.classList.add(a.correct ? 'answered' : 'missed');
      else if (a?.selected.length) button.classList.add('selected');
      if (index === state.session.cursor) { button.classList.add('current'); button.setAttribute('aria-current', 'step'); }
      button.addEventListener('click', () => jump(index));
      $('question-grid').append(button);
    });
  };
  const renderResult = () => {
    const stats = summarize(state.session);
    const names = { ordered: '顺序练习', random: '随机练习', wrong: '错题复习' };
    $('result-label').textContent = `${names[state.session.mode]} · 本轮成绩`;
    $('result-title').textContent = stats.submitted === 0 ? '选一个答案，从这里开始。' : stats.correct === stats.total ? '这一轮，全部答对！' : '每一题，都在积累。';
    $('result-score').textContent = `${stats.correct} / ${stats.total}`;
    $('result-detail').textContent = `答对 ${stats.correct} 题 · 答错 ${stats.wrong} 题 · 未答 ${stats.total - stats.submitted} 题。${stats.rate === null ? '尚无已提交答案。' : `已提交题目正确率 ${stats.rate}%。`}`;
    $('result-wrong').disabled = Object.keys(state.wrong).length === 0;
    $('overall-detail').textContent = `累计提交 ${state.overall.submitted} 次，答对 ${state.overall.correct} 次。重复练习按每次提交统计；未答不计入正确率。`;
  };
  const render = () => {
    renderStats();
    const empty = !state.session.ids.length;
    $('empty-view').hidden = !empty;
    $('question-view').hidden = empty || view !== 'question';
    $('result-view').hidden = empty || view !== 'result';
    $('show-result').disabled = empty;
    renderNavigation();
    if (!empty) { renderQuestion(); if (view === 'result') renderResult(); }
  };
  const focusTitle = () => $('question-title').focus({ preventScroll: true });
  const jump = index => {
    state.session.cursor = index;
    view = 'question';
    save();
    render();
    focusTitle();
  };
  const setScopeChoices = () => { $('scope-category').value = state.session.scope.category; $('scope-type').value = state.session.scope.type; };
  const startRound = (mode, scope = state.session.scope) => {
    state.session = makeSession(mode, state.wrong, scope);
    $('scope-box').open = false;
    setScopeChoices();
    view = 'question';
    save();
    render();
    if (state.session.ids.length) focusTitle();
  };
  const requestRound = (mode, force = false, scope = state.session.scope) => {
    if (!force && mode === state.session.mode && view === 'question') return;
    const stats = summarize(state.session);
    const hasSelections = Object.values(state.session.answers).some(a => a.selected.length);
    if (hasSelections && stats.submitted < stats.total) {
      pendingMode = mode;
      pendingScope = scope;
      $('confirm-title').textContent = mode === state.session.mode ? '重新开始这一轮？' : '切换并开始新一轮？';
      $('confirm-detail').textContent = '本轮答题进度将重置。错题本与累计统计会保留。';
      $('confirm-dialog').returnValue = 'cancel';
      $('confirm-dialog').showModal();
    } else startRound(mode, scope);
  };
  $('confirm-dialog').addEventListener('close', () => {
    if ($('confirm-dialog').returnValue === 'confirm' && pendingMode) startRound(pendingMode, pendingScope);
    pendingMode = null;
    pendingScope = null;
    setScopeChoices();
  });
  $('confirm-dialog').addEventListener('click', event => {
    if (event.target === $('confirm-dialog')) $('confirm-dialog').close('cancel');
  });
  $('prev').addEventListener('click', () => { if (state.session.cursor > 0) jump(state.session.cursor - 1); });
  $('next').addEventListener('click', () => {
    if (state.session.cursor < state.session.ids.length - 1) jump(state.session.cursor + 1);
    else { view = 'result'; render(); $('result-title').focus(); }
  });
  $('submit').addEventListener('click', submit);
  $('show-result').addEventListener('click', () => { view = 'result'; render(); $('result-title').focus(); });
  $('back-question').addEventListener('click', () => { view = 'question'; render(); focusTitle(); });
  for (const mode of ['ordered', 'random', 'wrong']) $('mode-' + mode).addEventListener('click', () => requestRound(mode, false, mode === 'wrong' ? { category: 'all', type: 'all' } : state.session.scope));
  for (const id of ['aside-review', 'result-wrong']) $(id).addEventListener('click', () => requestRound('wrong', true, { category: 'all', type: 'all' }));
  $('empty-start').addEventListener('click', () => requestRound('ordered'));
  $('restart').addEventListener('click', () => requestRound(state.session.mode, true));
  for (const category of categories) { const option = document.createElement('option'); option.value = category; option.textContent = category; $('scope-category').append(option); }
  $('scope-apply').addEventListener('click', () => requestRound(state.session.mode, true, { category: $('scope-category').value, type: $('scope-type').value }));
  setScopeChoices();
  const counts = {single:0,multiple:0,boolean:0}; for (const q of questions.values()) counts[q.type]++;
  $('source-note').textContent = `${BANK.questions.length} 题 · 单选 ${counts.single} / 多选 ${counts.multiple} / 判断 ${counts.boolean} · ${BANK.sourceNote}`;
  save();
  render();
})();
