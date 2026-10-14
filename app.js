(() => {
  'use strict';
  const BANK = window.QUESTION_BANK;
  const LEGACY_KEY = 'csu-military-theory-2026-500-v1';
  const KEY = 'csu-military-theory-2026-500-v2';
  let roundSequence = 0;
  const newRoundId = () => window.crypto?.randomUUID?.() ||
    'round-' + Date.now().toString(36) + '-' + (++roundSequence) + '-' + Math.random().toString(36).slice(2);
  const EXAM_SIZE = 100;
  const MODES = ['ordered', 'random', 'wrong', 'exam'];
  const $ = id => document.getElementById(id);
  const typeNames = { single: '单选题', multiple: '多选题', boolean: '判断题' };
  const questions = new Map((BANK?.questions || []).map(q => [q.id, q]));
  const allIds = [...questions.keys()];
  const categories = [...new Set([...questions.values()].map(q => q.category))];
  const normalizeScope = scope => ({
    category: categories.includes(scope?.category) ? scope.category : 'all',
    type: ['single', 'multiple', 'boolean'].includes(scope?.type) ? scope.type : 'all'
  });
  const filteredIds = scope => allIds.filter(id => {
    const q = questions.get(id);
    return (scope.category === 'all' || q.category === scope.category) &&
      (scope.type === 'all' || q.type === scope.type);
  });
  const grade = (q, selected) => {
    const actual = [...new Set(selected)].sort();
    const expected = [...q.answers].sort();
    return actual.length === expected.length && actual.every((id, i) => id === expected[i]);
  };
  const isExam = session => session.mode === 'exam';
  const examSubmitted = session => isExam(session) && Number.isFinite(session.submittedAt) && session.submittedAt > 0;
  const summarize = session => {
    const answered = session.ids.filter(id => session.answers[id]?.selected?.length > 0).length;
    const completed = examSubmitted(session);
    const graded = session.ids.map(id => session.answers[id]).filter(a => a?.graded);
    const correct = isExam(session) && !completed ? 0 : graded.filter(a => a.correct).length;
    const submitted = isExam(session) ? (completed ? session.ids.length : 0) : graded.length;
    return {
      answered, submitted, correct, total: session.ids.length,
      unanswered: session.ids.length - answered,
      wrong: submitted - correct,
      rate: isExam(session) ? (completed ? Math.round(correct / session.ids.length * 100) : null) :
        (submitted ? Math.round(correct / submitted * 100) : null)
    };
  };
  const shuffle = items => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const makeSession = (mode, wrong = {}, inputScope = {}) => {
    const scope = normalizeScope(mode === 'exam' ? {} : inputScope);
    const pool = filteredIds(scope);
    return {
      id: newRoundId(), mode, scope,
      ids: mode === 'exam' ? shuffle(allIds).slice(0, EXAM_SIZE) :
        mode === 'wrong' ? pool.filter(id => wrong[id]) : mode === 'random' ? shuffle(pool) : pool,
      cursor: 0, answers: {}, startedAt: Date.now(), submittedAt: null
    };
  };
  window.QuizCore = Object.freeze({ grade, summarize, makeSession });
  if (!BANK || !allIds.length) {
    $('source-note').textContent = '题库未加载，请重新打开网页。';
    $('question-title').textContent = '暂时无法加载题目';
    return;
  }
  const makeText = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  };

  // Keep the existing page and practice controls; add the exam entry at runtime.
  const examButton = makeText('button', 'tab', '模拟考试');
  examButton.id = 'mode-exam';
  examButton.type = 'button';
  examButton.disabled = allIds.length < EXAM_SIZE;
  document.querySelector('.mode-tabs').append(examButton);
  const examNotice = makeText('p', 'exam-notice',
    '从完整题库随机抽取100道不重复题目。每题1分，满分100分，交卷后统一判分；未答计0分。练习与考试进度分别保存，切换后可继续。');
  examNotice.id = 'exam-notice';
  examNotice.hidden = true;
  $('scope-box').before(examNotice);
  const style = document.createElement('style');
  style.textContent =
    '.exam-notice{padding:12px 14px;border-radius:10px;background:#eef3e8;border:1px solid #dbe5d3;color:#38583f;font-size:12px;line-height:1.7;margin:0 0 16px}' +
    '.exam-result .result-score{font-size:clamp(36px,9vw,60px)}' +
    '@media(max-width:520px){.mode-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;width:100%}.mode-tabs .tab{min-width:0;width:100%}}';
  document.head.append(style);
  const labels = document.querySelectorAll('.stats-grid .stat-label');
  const subs = document.querySelectorAll('.stats-grid .stat-sub');
  const confirmButton = $('confirm-dialog').querySelector('[value="confirm"]');
  const cancelButton = $('confirm-dialog').querySelector('[value="cancel"]');
  const historyButton = makeText('button', 'ghost-button', '成绩记录');
  historyButton.id = 'open-exam-history';
  historyButton.type = 'button';
  document.querySelector('.header-actions').append(historyButton);
  const historyPanel = makeText('section', 'exam-history', '');
  historyPanel.id = 'exam-history';
  historyPanel.setAttribute('aria-label', '模拟考试成绩记录');
  const historyTitle = makeText('h2', '', '模拟考试成绩');
  historyTitle.id = 'exam-history-title';
  historyTitle.tabIndex = -1;
  const historySummary = makeText('p', 'question-tip', '');
  const historyEmpty = makeText('p', 'history-empty',
    '还没有已交卷的模拟考试。每次交卷后，成绩会自动记录在这里。');
  const historyChart = makeText('div', 'history-chart-scroll', '');
  historyChart.id = 'exam-history-chart';
  historyChart.tabIndex = 0;
  historyChart.setAttribute('aria-label', '成绩折线图，可左右滑动查看全部考试');
  const historyPoint = makeText('p', 'history-point-detail', '');
  historyPoint.id = 'exam-history-point';
  historyPoint.setAttribute('role', 'status');
  historyPoint.setAttribute('aria-live', 'polite');
  const historyDetails = makeText('details', 'history-details', '');
  const historyDetailsTitle = makeText('summary', '', '');
  const historyList = makeText('ol', 'history-list', '');
  historyList.id = 'exam-history-list';
  historyDetails.append(historyDetailsTitle, historyList);
  historyPanel.append(historyTitle, historySummary, historyEmpty, historyChart, historyPoint,
    historyDetails, makeText('p', 'question-tip', '成绩与学习进度保存在当前浏览器，换设备或清除浏览器数据后不会同步。'));
  document.querySelector('.workspace').after(historyPanel);
  const historyStyle = document.createElement('style');
  historyStyle.textContent =
    '.header-actions{flex-wrap:wrap;justify-content:flex-end;gap:4px}' +
    '.exam-history{min-width:0;margin-top:22px;padding:24px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);scroll-margin-top:16px}' +
    '.exam-history h2{margin:0 0 8px;font-size:21px}.exam-history h2:focus{outline:none}' +
    '.history-empty{margin:20px 0;color:var(--ink-soft);font-size:13px}' +
    '.history-chart-scroll{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;border-radius:12px;background:#fafbf7;border:1px solid var(--line)}' +
    '.history-chart-scroll svg{display:block;max-width:none;height:245px;font-family:inherit}' +
    '.history-chart-scroll .history-point{cursor:pointer;fill:var(--green);stroke:white;stroke-width:3}' +
    '.history-chart-scroll .history-point:focus{outline:none;stroke:var(--orange);stroke-width:5}' +
    '.history-point-detail{padding:10px 12px;background:var(--green-soft);border-radius:8px;color:var(--green);font-size:12px}' +
    '.history-details summary{cursor:pointer;color:var(--green);font-size:13px;min-height:44px;display:flex;align-items:center}' +
    '.history-list{list-style:none;padding:0;margin:0;max-height:300px;overflow:auto}' +
    '.history-list li{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid var(--line);font-size:12px}' +
    '.history-list li span{color:var(--ink-soft)}.history-list li strong{white-space:nowrap;color:var(--green)}' +
    '@media(max-width:520px){.exam-history{padding:18px 14px;border-radius:18px}.exam-history h2{font-size:18px}.header-actions{max-width:48%;gap:0}.topbar{gap:6px}.stat-value{white-space:nowrap}}';
  document.head.append(historyStyle);
  historyButton.addEventListener('click', () => {
    historyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    historyTitle.focus({ preventScroll: true });
  });
  const withActiveSession = data => Object.defineProperty(data, 'session', {
    enumerable: false,
    get() { return this.sessions[this.activeMode]; },
    set(session) {
      if (session.mode !== this.activeMode) throw new Error('会话模式不匹配');
      this.sessions[this.activeMode] = session;
    }
  });
  const freshState = () => withActiveSession({
    schema: 2, bankVersion: BANK.version, wrong: {},
    overall: { submitted: 0, correct: 0 },
    activeMode: 'ordered', sessions: { ordered: makeSession('ordered') }, examHistory: []
  });
  const cleanSession = s => {
    if (!s || !MODES.includes(s.mode) || !Array.isArray(s.ids)) return null;
    const scope = normalizeScope(isExam(s) ? {} : s.scope);
    const scopeIds = filteredIds(scope);
    if (s.ids.some(id => !questions.has(id) || !scopeIds.includes(id)) ||
        new Set(s.ids).size !== s.ids.length ||
        (isExam(s) ? s.ids.length !== EXAM_SIZE : s.mode !== 'wrong' && s.ids.length !== scopeIds.length)) return null;
    const startedAt = Number.isFinite(s.startedAt) && s.startedAt > 0 ? s.startedAt : Date.now();
    const submittedAt = examSubmitted(s) ? s.submittedAt : null;
    const clean = {
      id: typeof s.id === 'string' && s.id.length > 0 && s.id.length < 256 ? s.id :
        'legacy-' + s.mode + '-' + startedAt + '-' + (submittedAt || 'pending'),
      mode: s.mode, scope, ids: [...s.ids], submittedAt, startedAt,
      cursor: Math.min(Math.max(Number.isInteger(s.cursor) ? s.cursor : 0, 0), Math.max(s.ids.length - 1, 0)),
      answers: {}
    };
    for (const id of s.ids) {
      const a = s.answers?.[id];
      const q = questions.get(id);
      let selected = a && Array.isArray(a.selected) &&
        a.selected.every(o => q.options.some(x => x.id === o)) ? [...new Set(a.selected)] : [];
      if (q.type !== 'multiple' && selected.length > 1) selected = [];
      if (!isExam(s) && !a) continue;
      const graded = isExam(s) ? submittedAt !== null : a?.graded === true && selected.length > 0;
      clean.answers[id] = { selected, graded, correct: graded && grade(q, selected) };
    }
    return clean;
  };
  const cleanHistory = history => {
    const seen = new Set();
    return (Array.isArray(history) ? history : []).filter(r => {
      if (!r || typeof r.id !== 'string' || !r.id || r.id.length >= 256 || seen.has(r.id) ||
          r.total !== EXAM_SIZE || !Number.isInteger(r.score) || r.score < 0 || r.score > EXAM_SIZE ||
          !Number.isInteger(r.answered) || r.answered < r.score || r.answered > EXAM_SIZE ||
          !Number.isFinite(r.submittedAt) || r.submittedAt <= 0) return false;
      seen.add(r.id);
      return true;
    }).map(r => ({
      id: r.id, submittedAt: r.submittedAt,
      startedAt: Number.isFinite(r.startedAt) && r.startedAt > 0 ? r.startedAt : r.submittedAt,
      score: r.score, total: EXAM_SIZE, answered: r.answered,
      unanswered: EXAM_SIZE - r.answered
    })).sort((a, b) => a.submittedAt - b.submittedAt);
  };
  const recordExam = (data, session) => {
    if (!session || !examSubmitted(session) || data.examHistory.some(r => r.id === session.id)) return;
    const stats = summarize(session);
    data.examHistory.push({
      id: session.id, startedAt: session.startedAt, submittedAt: session.submittedAt,
      score: stats.correct, total: EXAM_SIZE, answered: stats.answered, unanswered: stats.unanswered
    });
    data.examHistory.sort((a, b) => a.submittedAt - b.submittedAt);
  };
  let storageAvailable = true;
  const loadState = () => {
    try {
      const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
      if (!raw) return freshState();
      const saved = JSON.parse(raw);
      if (![1, 2].includes(saved.schema) || saved.bankVersion !== BANK.version) return freshState();
      const clean = freshState();
      if (saved.schema === 1) {
        const session = cleanSession(saved.session);
        if (session) {
          clean.sessions[session.mode] = session;
          clean.activeMode = session.mode;
        }
      } else {
        for (const mode of MODES) {
          const session = cleanSession(saved.sessions?.[mode]);
          if (session?.mode === mode) clean.sessions[mode] = session;
        }
        if (MODES.includes(saved.activeMode) && clean.sessions[saved.activeMode]) clean.activeMode = saved.activeMode;
      }
      for (const id of allIds) {
        if (saved.wrong?.[id]) clean.wrong[id] = {
          misses: Math.max(1, Math.floor(Number(saved.wrong[id].misses) || 1))
        };
      }
      const submitted = Math.max(0, Math.floor(Number(saved.overall?.submitted) || 0));
      clean.overall = {
        submitted,
        correct: Math.min(submitted, Math.max(0, Math.floor(Number(saved.overall?.correct) || 0)))
      };
      clean.examHistory = cleanHistory(saved.examHistory);
      // Import the most recent previously submitted exam without counting its wrong answers again.
      recordExam(clean, clean.sessions.exam);
      return clean;
    } catch (error) {
      if (error.name !== 'SyntaxError') storageAvailable = false;
      return freshState();
    }
  };
  let state = loadState();
  let view = examSubmitted(state.session) ? 'result' : 'question';
  let pending = null;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
    $('storage-warning').hidden = storageAvailable;
  };
  const currentQuestion = () => questions.get(state.session.ids[state.session.cursor]);
  const syncWrong = (id, correct) => {
    if (correct) delete state.wrong[id];
    else state.wrong[id] = { misses: (state.wrong[id]?.misses || 0) + 1 };
  };
  const select = optionId => {
    const q = currentQuestion();
    const old = state.session.answers[q.id];
    if (old?.graded || examSubmitted(state.session)) return;
    const previous = old?.selected || [];
    const selected = q.type === 'multiple' ?
      (previous.includes(optionId) ? previous.filter(id => id !== optionId) : [...previous, optionId]) : [optionId];
    state.session.answers[q.id] = { selected, graded: false, correct: false };
    if (isExam(state.session) || q.type === 'multiple') {
      save();
      render();
      $('options').querySelector('[data-option="' + optionId + '"]')?.focus({ preventScroll: true });
    } else submit();
  };
  const submit = () => {
    if (isExam(state.session)) return;
    const q = currentQuestion();
    const a = q && state.session.answers[q.id];
    if (!a || a.graded || !a.selected.length) return;
    a.graded = true;
    a.correct = grade(q, a.selected);
    state.overall.submitted++;
    if (a.correct) state.overall.correct++;
    syncWrong(q.id, a.correct);
    save();
    render();
    $('next').focus({ preventScroll: true });
  };
  const finishExam = () => {
    if (!isExam(state.session) || examSubmitted(state.session)) return;
    for (const id of state.session.ids) {
      const selected = state.session.answers[id]?.selected || [];
      const correct = grade(questions.get(id), selected);
      state.session.answers[id] = { selected, graded: true, correct };
      syncWrong(id, correct);
    }
    state.session.submittedAt = Date.now();
    recordExam(state, state.session);
    view = 'result';
    save();
    render();
    $('result-title').focus();
  };
  const confirmAction = (action, title, detail, confirmText, cancelText = '取消') => {
    pending = action;
    $('confirm-title').textContent = title;
    $('confirm-detail').textContent = detail;
    confirmButton.textContent = confirmText;
    cancelButton.textContent = cancelText;
    $('confirm-dialog').returnValue = 'cancel';
    $('confirm-dialog').showModal();
  };
  const requestFinishExam = () => {
    if (!isExam(state.session)) return;
    if (examSubmitted(state.session)) {
      view = 'result';
      render();
      $('result-title').focus();
      return;
    }
    const stats = summarize(state.session);
    confirmAction({ kind: 'finish-exam' }, '确认交卷？',
      '已答 ' + stats.answered + ' / 100 题，未答 ' + stats.unanswered +
      ' 题。未答计0分；交卷后答案将锁定，并统一显示成绩与解析。',
      '确认交卷', '继续答题');
  };
  const renderStats = () => {
    const s = state.session;
    const exam = isExam(s);
    const completed = examSubmitted(s);
    const stats = summarize(s);
    const progress = exam ? stats.answered : stats.submitted;
    const wrongCount = Object.keys(state.wrong).length;
    labels[0].textContent = exam ? '考试已答' : '本轮已答';
    labels[1].textContent = exam ? '考试得分' : '本轮答对';
    labels[2].textContent = exam ? '考试正确率' : '本轮正确率';
    subs[0].textContent = exam ? '已选择答案的题目' : '已提交的题目';
    subs[1].textContent = exam ? '每题1分，满分100分' : '每题同等分值';
    subs[2].textContent = exam ? '答对 ÷ 100题' : '答对 ÷ 已提交';
    $('scope-box').hidden = exam;
    $('exam-notice').hidden = !exam;
    $('scope-status').textContent = exam ?
      (completed ? '模拟考试已交卷 · 成绩已记录 · 练习进度已保留' : '模拟考试进行中 · 交卷前可修改答案 · 切换练习会保留本场考试') :
      '当前范围：' + (s.scope.category === 'all' ? '全部章节' : s.scope.category) + ' · ' +
      (s.scope.type === 'all' ? '全部题型' : typeNames[s.scope.type]) + ' · ' + stats.total + ' 题';
    $('stat-progress').textContent = progress + ' / ' + stats.total;
    $('stat-correct').textContent = exam && !completed ? '—' : String(stats.correct) + (exam ? '分' : '');
    $('stat-rate').textContent = stats.rate === null ? '—' : stats.rate + '%';
    $('stat-wrong').textContent = wrongCount;
    $('mode-wrong-count').textContent = wrongCount;
    $('aside-wrong').textContent = wrongCount + ' 道待复习';
    $('progress-fill').style.width = (stats.total ? progress / stats.total * 100 : 0) + '%';
    $('round-progress').setAttribute('aria-valuemax', stats.total);
    $('round-progress').setAttribute('aria-valuenow', progress);
    $('show-result').textContent = exam ? (completed ? '考试成绩' : '交卷') : '本轮成绩';
    $('restart').textContent = exam ? '重新考试' : '重新开始';
    $('result-view').classList.toggle('exam-result', exam);
    $('back-question').textContent = exam ? '查看试卷' : '回到题目';
    for (const mode of MODES) {
      $('mode-' + mode).classList.toggle('active', s.mode === mode);
      $('mode-' + mode).setAttribute('aria-pressed', String(s.mode === mode));
    }
  };
  const renderQuestion = () => {
    const q = currentQuestion();
    if (!q) return;
    const s = state.session;
    const exam = isExam(s);
    const a = s.answers[q.id] || { selected: [], graded: false, correct: false };
    const graded = exam ? examSubmitted(s) : a.graded;
    $('type-tag').textContent = typeNames[q.type];
    $('question-number').textContent = (exam ? '考试 ' : '本轮 ') +
      (s.cursor + 1) + ' / ' + s.ids.length + ' · 原题 ' + q.number;
    $('question-category').textContent = q.category;
    $('question-title').textContent = q.title;
    $('question-tip').textContent = exam && !graded ?
      (q.type === 'multiple' ? '可勾选多个答案，交卷前可修改。交卷后显示答案与解析。' :
        '点选一个答案，交卷前可修改。交卷后显示答案与解析。') :
      q.type === 'multiple' ? '可选多个答案。全部选对、无漏选或多选才得分。' :
        '点选一个答案，即可查看判分和解析。';
    $('options').replaceChildren();
    for (const option of q.options) {
      const selected = a.selected.includes(option.id);
      const isAnswer = q.answers.includes(option.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option';
      button.dataset.option = option.id;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = graded;
      if (selected) button.classList.add('selected');
      if (graded && isAnswer) button.classList.add('correct');
      if (graded && selected && !isAnswer) button.classList.add('wrong');
      button.append(makeText('span', 'option-letter', option.id), makeText('span', 'option-text', option.text));
      const status = graded ? (isAnswer ? '✓' : selected ? '✕' : '') : selected ? '✓' : '';
      button.setAttribute('aria-label', option.id + '. ' + option.text +
        (graded ? (isAnswer ? '，正确答案' : selected ? '，所选错误答案' : '') : selected ? '，已选择' : ''));
      button.append(makeText('span', 'option-status', status));
      button.addEventListener('click', () => select(option.id));
      $('options').append(button);
    }
    $('submit').hidden = exam || q.type !== 'multiple' || graded;
    $('submit').disabled = !a.selected.length;
    $('feedback').hidden = !graded;
    $('feedback').className = 'feedback ' + (a.correct ? 'good' : 'bad');
    $('feedback').replaceChildren();
    if (graded) {
      const title = a.correct ? '答对了，继续保持！' :
        exam && !a.selected.length ? '此题未作答，已加入错题本' : '这题已加入错题本';
      $('feedback').append(makeText('h3', 'feedback-title', title));
      const answerText = q.options.filter(o => q.answers.includes(o.id))
        .map(o => o.id + '. ' + o.text).join('；');
      const pages = q.sourcePages?.length > 1 ?
        q.sourcePages[0] + '–' + q.sourcePages[q.sourcePages.length - 1] : q.sourcePage;
      $('feedback').append(makeText('p', 'answer-line', '正确答案：' + answerText),
        makeText('p', 'explanation', q.explanation),
        makeText('p', 'source-line', '来源：题库第 ' + pages + ' 页 · 原题 ' + q.number));
    }
    $('prev').disabled = s.cursor === 0;
    $('next').textContent = s.cursor === s.ids.length - 1 ?
      (exam && !graded ? '交卷并查看成绩' : '查看本轮成绩') :
      (graded || (exam && a.selected.length) ? '下一题 →' : '暂时跳过 →');
  };
  const renderNavigation = () => {
    $('question-grid').replaceChildren();
    const s = state.session;
    const stats = summarize(s);
    $('navigator-count').textContent = (isExam(s) ? stats.answered : stats.submitted) + '/' + stats.total;
    s.ids.forEach((id, index) => {
      const a = s.answers[id];
      const button = makeText('button', 'question-dot', String(questions.get(id).number).padStart(3, '0'));
      button.type = 'button';
      const status = a?.graded ? (a.correct ? '答对' : '答错') :
        a?.selected.length ? (isExam(s) ? '已作答，未交卷' : '已选择，未提交') : '未答';
      button.setAttribute('aria-label', '原题第 ' + questions.get(id).number + ' 题，' + status);
      if (a?.graded) button.classList.add(a.correct ? 'answered' : 'missed');
      else if (a?.selected.length) button.classList.add('selected');
      if (index === s.cursor) {
        button.classList.add('current');
        button.setAttribute('aria-current', 'step');
      }
      button.addEventListener('click', () => jump(index));
      $('question-grid').append(button);
    });
  };
  const renderResult = () => {
    const stats = summarize(state.session);
    const exam = isExam(state.session);
    const names = { ordered: '顺序练习', random: '随机练习', wrong: '错题复习', exam: '模拟考试' };
    $('result-label').textContent = names[state.session.mode] + (exam ? ' · 考试成绩' : ' · 本轮成绩');
    $('result-title').textContent = exam ? (stats.correct === EXAM_SIZE ? '满分，全部答对！' : '模拟考试已交卷') :
      stats.submitted === 0 ? '选一个答案，从这里开始。' :
        stats.correct === stats.total ? '这一轮，全部答对！' : '每一题，都在积累。';
    $('result-score').textContent = stats.correct + ' / ' + stats.total;
    $('result-detail').textContent = exam ?
      '得分 ' + stats.correct + ' 分 · 答对 ' + stats.correct + ' 题 · 答错 ' +
      (stats.answered - stats.correct) + ' 题 · 未答 ' + stats.unanswered + ' 题 · 正确率 ' + stats.rate + '%。' :
      '答对 ' + stats.correct + ' 题 · 答错 ' + stats.wrong + ' 题 · 未答 ' +
      (stats.total - stats.submitted) + ' 题。' +
      (stats.rate === null ? '尚无已提交答案。' : '已提交题目正确率 ' + stats.rate + '%。');
    $('result-wrong').disabled = Object.keys(state.wrong).length === 0;
    $('overall-detail').textContent = exam ?
      '每题1分，满分100分。错答、未答和多选漏选/多选均计0分；错题与未答题已加入错题本。考试成绩独立统计。' :
      '累计练习提交 ' + state.overall.submitted + ' 次，答对 ' + state.overall.correct +
      ' 次。重复练习按每次提交统计；未答不计入练习正确率。';
  };
  let historyRenderKey = null;
  const formatExamDate = time => new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(time);
  const renderHistory = () => {
    const records = state.examHistory;
    const key = records.map(r => r.id + ':' + r.score).join('|');
    if (key === historyRenderKey) return;
    historyRenderKey = key;
    historyEmpty.hidden = records.length > 0;
    historyChart.hidden = !records.length;
    historyPoint.hidden = !records.length;
    historyDetails.hidden = !records.length;
    historyChart.replaceChildren();
    historyList.replaceChildren();
    if (!records.length) {
      historySummary.textContent = '每次交卷后自动记录 · 每场满分100分';
      historyPoint.textContent = '';
      return;
    }
    const latest = records[records.length - 1];
    const average = records.reduce((sum, r) => sum + r.score, 0) / records.length;
    historySummary.textContent = '已考 ' + records.length + ' 次 · 最近 ' + latest.score +
      ' 分 · 最高 ' + Math.max(...records.map(r => r.score)) + ' 分 · 平均 ' + average.toFixed(1) + ' 分';
    const describe = index => {
      const r = records[index];
      historyPoint.textContent = '第 ' + (index + 1) + ' 次 · ' + formatExamDate(r.submittedAt) +
        ' · ' + r.score + ' / 100分 · 未答 ' + r.unanswered + ' 题';
    };
    describe(records.length - 1);
    const ns = 'http://www.w3.org/2000/svg';
    const svgNode = (tag, attributes, text) => {
      const el = document.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attributes || {})) el.setAttribute(name, value);
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const width = Math.max(historyChart.clientWidth || 480, (records.length - 1) * 56 + 90);
    const svg = svgNode('svg', { width, height: 245, viewBox: '0 0 ' + width + ' 245',
      role: 'group', 'aria-label': '成绩折线图：纵轴0到100分，横轴为考试次序。点击数据点查看考试记录。' });
    const left = 45, right = width - 25, top = 24, bottom = 202;
    for (const score of [0, 25, 50, 75, 100]) {
      const y = bottom - score / 100 * (bottom - top);
      svg.append(svgNode('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#e3e6dc' }),
        svgNode('text', { x: left - 9, y: y + 4, 'text-anchor': 'end', fill: '#697064', 'font-size': 11 }, score));
    }
    svg.append(svgNode('text', { x: left, y: 14, fill: '#697064', 'font-size': 10 }, '分数'));
    const points = records.map((r, i) => ({
      x: records.length === 1 ? (left + right) / 2 : left + i / (records.length - 1) * (right - left),
      y: bottom - r.score / 100 * (bottom - top)
    }));
    svg.append(svgNode('polyline', { points: points.map(p => p.x + ',' + p.y).join(' '),
      fill: 'none', stroke: '#38583f', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    records.forEach((r, i) => {
      const point = points[i];
      const dot = svgNode('circle', { cx: point.x, cy: point.y, r: 7, class: 'history-point',
        tabindex: 0, role: 'button', 'aria-label': '第' + (i + 1) + '次考试，' + r.score + '分，' + formatExamDate(r.submittedAt) });
      dot.append(svgNode('title', {}, '第' + (i + 1) + '次 · ' + formatExamDate(r.submittedAt) + ' · ' + r.score + '分'));
      dot.addEventListener('click', () => describe(i));
      dot.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); describe(i); }
      });
      svg.append(dot, svgNode('text', { x: point.x, y: Math.max(17, point.y - 12),
        'text-anchor': 'middle', fill: '#38583f', 'font-size': 11, 'font-weight': 700 }, r.score),
      svgNode('text', { x: point.x, y: 225, 'text-anchor': 'middle', fill: '#697064', 'font-size': 11 }, '第' + (i + 1) + '次'));
    });
    historyChart.append(svg);
    historyDetailsTitle.textContent = '查看全部 ' + records.length + ' 次考试成绩 ▾';
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      const row = makeText('li', '', '');
      row.append(makeText('span', '', '第 ' + (i + 1) + ' 次 · ' + formatExamDate(r.submittedAt) + ' · 未答 ' + r.unanswered + ' 题'),
        makeText('strong', '', r.score + ' / 100分'));
      historyList.append(row);
    }
  };
  window.addEventListener?.('resize', () => { historyRenderKey = null; renderHistory(); });
  const render = () => {
    renderStats();
    renderHistory();
    const empty = !state.session.ids.length;
    if (isExam(state.session) && !examSubmitted(state.session)) view = 'question';
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
  const setScopeChoices = () => {
    $('scope-category').value = state.session.scope.category;
    $('scope-type').value = state.session.scope.type;
  };
  const showSession = () => {
    $('scope-box').open = false;
    setScopeChoices();
    view = examSubmitted(state.session) ? 'result' : 'question';
    save();
    render();
    if (state.session.ids.length) {
      if (view === 'result') $('result-title').focus();
      else focusTitle();
    }
  };
  const startRound = (mode, scope = state.session.scope) => {
    if (mode === 'exam' && allIds.length < EXAM_SIZE) return;
    state.activeMode = mode;
    state.session = makeSession(mode, state.wrong, scope);
    showSession();
  };
  const requestRound = (mode, force = false, scope = state.session.scope) => {
    if (!force && state.sessions[mode]) {
      if (mode === 'wrong') {
        const session = state.sessions.wrong;
        const existing = new Set(session.ids);
        for (const id of filteredIds(session.scope)) {
          if (state.wrong[id] && !existing.has(id)) session.ids.push(id);
        }
      }
      state.activeMode = mode;
      showSession();
      return;
    }
    if (mode === 'exam') {
      const previous = state.sessions.exam;
      confirmAction({ kind: 'start-round', mode, scope: {} },
        previous ? '重新抽取100题？' : '开始模拟考试？',
        previous && !examSubmitted(previous) ?
          '当前未交卷试卷和已选答案会重置。各练习模式进度、错题本和历次考试成绩会保留。' :
          '从完整500题中随机抽取100题，每题1分。各练习模式进度会保留，交卷后自动保存成绩。',
        '开始考试');
      return;
    }
    const previous = state.sessions[mode];
    if (force && previous && Object.values(previous.answers).some(a => a.selected.length)) {
      confirmAction({ kind: 'start-round', mode, scope }, '重新开始本模式练习？',
        '只重置这个练习模式的本轮进度。其他模式、考试进度、错题本和历次考试成绩会保留。',
        '开始新一轮');
    } else startRound(mode, scope);
  };
  $('confirm-dialog').addEventListener('close', () => {
    const action = pending;
    pending = null;
    if ($('confirm-dialog').returnValue === 'confirm' && action) {
      if (action.kind === 'finish-exam') finishExam();
      else startRound(action.mode, action.scope);
    }
    setScopeChoices();
  });
  $('confirm-dialog').addEventListener('click', event => {
    if (event.target === $('confirm-dialog')) $('confirm-dialog').close('cancel');
  });
  $('prev').addEventListener('click', () => {
    if (state.session.cursor > 0) jump(state.session.cursor - 1);
  });
  $('next').addEventListener('click', () => {
    if (state.session.cursor < state.session.ids.length - 1) jump(state.session.cursor + 1);
    else if (isExam(state.session) && !examSubmitted(state.session)) requestFinishExam();
    else { view = 'result'; render(); $('result-title').focus(); }
  });
  $('submit').addEventListener('click', submit);
  $('show-result').addEventListener('click', () => {
    if (isExam(state.session)) requestFinishExam();
    else { view = 'result'; render(); $('result-title').focus(); }
  });
  $('back-question').addEventListener('click', () => { view = 'question'; render(); focusTitle(); });
  for (const mode of MODES) $('mode-' + mode).addEventListener('click', () => requestRound(
    mode, false, mode === 'wrong' ? { category: 'all', type: 'all' } : state.session.scope
  ));
  for (const id of ['aside-review', 'result-wrong']) $(id).addEventListener('click', () =>
    requestRound('wrong', true, { category: 'all', type: 'all' }));
  $('empty-start').addEventListener('click', () => requestRound('ordered'));
  $('restart').addEventListener('click', () => requestRound(state.session.mode, true));
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    $('scope-category').append(option);
  }
  $('scope-apply').addEventListener('click', () => requestRound(state.session.mode, true, {
    category: $('scope-category').value, type: $('scope-type').value
  }));
  setScopeChoices();
  const counts = { single: 0, multiple: 0, boolean: 0 };
  for (const q of questions.values()) counts[q.type]++;
  $('source-note').textContent = BANK.questions.length + ' 题 · 单选 ' + counts.single +
    ' / 多选 ' + counts.multiple + ' / 判断 ' + counts.boolean + ' · ' + BANK.sourceNote;
  save();
  render();
})();
