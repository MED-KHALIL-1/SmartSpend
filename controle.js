/* ==========================================================
   SmartSpend - controle.js
   Handles data, calculations, validation, storage and the UI.

   Money model:
   - A "period" runs from the reset day of one month up to (not
     including) the reset day of the next month. Reset day 1 means
     a normal calendar month.
   - Available balance = income - expenses in the current period,
     and never shows below 0.
   ========================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     CONSTANTS
     ---------------------------------------------------------- */
  const STORAGE_KEYS = {
    transactions: 'smartSpendTransactions',
    resetDay: 'smartSpendResetDay'
  };

  const DEFAULT_RESET_DAY = 1;
  const MAX_AMOUNT = 999999999.999;      // TND
  const MAX_DESCRIPTION_LENGTH = 100;

  const CATEGORIES = {
    expense: ['Food', 'Transport', 'Shopping', 'Bills', 'Other'],
    income: ['Salary', 'Other']
  };
  const ALL_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Salary', 'Other'];

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = MONTHS.map(function (m) { return m.slice(0, 3); });

  /* ----------------------------------------------------------
     PART A: SELECT HTML ELEMENTS
     ---------------------------------------------------------- */
  const els = {
    storageStatus: document.querySelector('.headstat'),
    storageText: document.querySelector('#storageText'),
    welcomeText: document.querySelector('#welcomeText'),

    balanceAmount: document.querySelector('#balanceAmount'),
    resetSelect: document.querySelector('#resetDay'),
    resetHint: document.querySelector('#resetHint'),
    progBar: document.querySelector('.progbar'),
    progFill: document.querySelector('.progfill'),
    spentValue: document.querySelector('#spentValue'),
    periodIncome: document.querySelector('#periodIncome'),
    budStatus: document.querySelector('#budStatus'),

    incomeValue: document.querySelector('#incomeValue'),
    expenseValue: document.querySelector('#expenseValue'),
    incomeDesc: document.querySelector('#incomeDesc'),
    expenseDesc: document.querySelector('#expenseDesc'),

    filterSelect: document.querySelector('#filterSelect'),
    txList: document.querySelector('#txList'),
    txEmpty: document.querySelector('#txEmpty'),
    emptyTitle: document.querySelector('#emptyTitle'),
    emptyText: document.querySelector('#emptyText'),

    form: document.querySelector('#txForm'),
    amount: document.querySelector('#amount'),
    category: document.querySelector('#category'),
    description: document.querySelector('#description'),
    date: document.querySelector('#date'),
    formMessage: document.querySelector('#formMessage'),

    toast: document.querySelector('#toast')
  };

  /* ----------------------------------------------------------
     PART B: APPLICATION DATA
     Each transaction: { id, type, amount, category, description, date }
     amount is a number in TND; calculations use integer millimes.
     ---------------------------------------------------------- */
  const state = {
    transactions: [],
    resetDay: DEFAULT_RESET_DAY,
    filter: 'all'
  };

  /* ----------------------------------------------------------
     PART C: LOAD AND SAVE (localStorage)
     ---------------------------------------------------------- */
  function storageRead(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageWrite(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function storageAvailable() {
    try {
      const testKey = '__smartspend_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  function setStorageStatus(ok) {
    els.storageStatus.classList.toggle('is-error', !ok);
    els.storageText.textContent = ok
      ? 'All data saved locally'
      : 'Storage unavailable. Changes won\u2019t be saved.';
  }

  function saveTransactions(list) {
    const ok = storageWrite(STORAGE_KEYS.transactions, JSON.stringify(list));
    setStorageStatus(ok);
    return ok;
  }

  function saveResetDay(day) {
    const ok = storageWrite(STORAGE_KEYS.resetDay, String(day));
    setStorageStatus(ok);
    return ok;
  }

  function isValidTransaction(t) {
    return t !== null &&
      typeof t === 'object' &&
      typeof t.id === 'string' && t.id !== '' &&
      (t.type === 'income' || t.type === 'expense') &&
      typeof t.amount === 'number' && Number.isFinite(t.amount) && t.amount > 0 &&
      typeof t.category === 'string' && t.category !== '' &&
      typeof t.description === 'string' &&
      isValidDateString(t.date);
  }

  function loadTransactions() {
    const raw = storageRead(STORAGE_KEYS.transactions);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidTransaction);
    } catch (e) {
      return [];
    }
  }

  function loadResetDay() {
    const raw = storageRead(STORAGE_KEYS.resetDay);
    if (raw === null || raw.trim() === '') return DEFAULT_RESET_DAY;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 31) return DEFAULT_RESET_DAY;
    return n;
  }

  /* ----------------------------------------------------------
     PART D: MONEY AND DATE HELPERS
     ---------------------------------------------------------- */
  function toMillimes(tnd) {
    return Math.round(tnd * 1000);
  }

  function formatTND(millimes) {
    const sign = millimes < 0 ? '-' : '';
    const abs = Math.abs(millimes);
    const whole = Math.floor(abs / 1000);
    const fraction = String(abs % 1000).padStart(3, '0');
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + grouped + '.' + fraction + ' TND';
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function todayString() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isValidDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    if (y < 1900) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function formatDate(dateStr) {
    const parts = dateStr.split('-').map(Number);
    return parts[2] + ' ' + MONTHS_SHORT[parts[1] - 1] + ' ' + parts[0];
  }

  // Whole days from one YYYY-MM-DD string to another (time zone safe).
  function daysBetween(fromStr, toStr) {
    const a = fromStr.split('-').map(Number);
    const b = toStr.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }

  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // Parses an amount string into a number with at most 3 decimals.
  // Returns { value } or { error }.
  function parseAmount(raw) {
    const text = String(raw).trim();
    if (text === '') return { error: 'Enter an amount.' };

    const n = Number(text);
    if (!Number.isFinite(n)) {
      return { error: 'Enter the amount as a number, using a dot for decimals.' };
    }
    if (n <= 0) return { error: 'Amount must be greater than zero.' };
    if (n > MAX_AMOUNT) {
      return { error: 'The amount can\u2019t be more than 999,999,999.999 TND.' };
    }
    const millimes = Math.round(n * 1000);
    if (Math.abs(n * 1000 - millimes) > 1e-6) {
      return { error: 'Use at most 3 decimal places.' };
    }
    return { value: millimes / 1000 };
  }

  /* ----------------------------------------------------------
     PERIODS (based on the reset day)
     ---------------------------------------------------------- */
  function daysInMonth(year, month0) {
    return new Date(year, month0 + 1, 0).getDate();
  }

  // The reset date inside a given month. Short months use their last day.
  function resetDateFor(year, month0) {
    const day = Math.min(state.resetDay, daysInMonth(year, month0));
    return year + '-' + pad(month0 + 1) + '-' + pad(day);
  }

  // offset 0 = current period, -1 = the one before.
  // start is included, end (the next reset date) is not.
  function getPeriod(offset) {
    const now = new Date();
    const today = todayString();
    let y = now.getFullYear();
    let m = now.getMonth();
    if (resetDateFor(y, m) > today) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    const startTotal = y * 12 + m + offset;
    const endTotal = startTotal + 1;
    return {
      start: resetDateFor(Math.floor(startTotal / 12), startTotal % 12),
      end: resetDateFor(Math.floor(endTotal / 12), endTotal % 12)
    };
  }

  function isInPeriod(dateStr, period) {
    return dateStr >= period.start && dateStr < period.end;
  }

  function periodLabel(period) {
    if (state.resetDay === 1) {
      return MONTHS[Number(period.start.slice(5, 7)) - 1] + ' ' + period.start.slice(0, 4);
    }
    return formatDate(period.start) + ' to ' + formatDate(addDays(period.end, -1));
  }

  function periodWord() {
    return state.resetDay === 1 ? 'this month' : 'this period';
  }

  /* ----------------------------------------------------------
     MESSAGES
     ---------------------------------------------------------- */
  let toastTimer = null;

  function showToast(text, type) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = text;
    els.toast.className = 'toast show ' + (type || 'success');
    toastTimer = window.setTimeout(function () {
      els.toast.classList.remove('show');
    }, 3500);
  }

  function showFormMessage(text, type) {
    els.formMessage.textContent = text;
    els.formMessage.className = 'formmsg ' + type;
  }

  function clearFormMessage() {
    els.formMessage.textContent = '';
    els.formMessage.className = 'formmsg';
  }

  /* ----------------------------------------------------------
     PART E: FINANCIAL CALCULATIONS (all in millimes)
     ---------------------------------------------------------- */
  function periodTransactions(period, type) {
    return state.transactions.filter(function (t) {
      return isInPeriod(t.date, period) && (!type || t.type === type);
    });
  }

  function sumMillimes(list) {
    return list.reduce(function (sum, t) { return sum + toMillimes(t.amount); }, 0);
  }

  function getTotals() {
    const period = getPeriod(0);
    const income = sumMillimes(periodTransactions(period, 'income'));
    const expenses = sumMillimes(periodTransactions(period, 'expense'));
    const net = income - expenses;
    return {
      period: period,
      income: income,
      expenses: expenses,
      net: net,
      available: Math.max(0, net),          // never shown below 0
      shortfall: Math.max(0, -net),         // how far spending went past income
      percent: income > 0 ? (expenses / income) * 100 : null
    };
  }

  /* ----------------------------------------------------------
     PART F: UPDATE THE INTERFACE
     ---------------------------------------------------------- */
  function renderWelcome(totals) {
    els.welcomeText.textContent =
      'Here\u2019s an overview of your finances for ' + periodLabel(totals.period) + '.';
  }

  function renderSummary(totals) {
    els.incomeValue.textContent = formatTND(totals.income);
    els.expenseValue.textContent = formatTND(totals.expenses);
    els.incomeDesc.textContent = 'Money received ' + periodWord();
    els.expenseDesc.textContent = 'Money spent ' + periodWord();
  }

  function renderBalancePanel(totals) {
    const over = totals.expenses > totals.income;

    let width;
    let statusText;
    if (totals.income > 0) {
      width = Math.min(100, totals.percent);
      statusText = over
        ? 'Spent ' + formatTND(totals.shortfall) + ' more than income'
        : Math.round(totals.percent) + '% of income used';
    } else {
      width = totals.expenses > 0 ? 100 : 0;
      statusText = totals.expenses > 0 ? 'No income recorded' : 'No income yet';
    }

    els.balanceAmount.textContent = formatTND(totals.available);
    els.spentValue.textContent = formatTND(totals.expenses);
    els.periodIncome.textContent = formatTND(totals.income);

    els.progFill.style.width = width + '%';
    els.progFill.classList.toggle('over', over);

    els.budStatus.textContent = statusText;
    els.budStatus.classList.toggle('over', over);

    els.progBar.setAttribute('aria-valuenow', String(Math.round(width)));
  }

  function renderResetHint(totals) {
    const days = daysBetween(todayString(), totals.period.end);
    let text = 'Next reset: ' + formatDate(totals.period.end) +
      (days === 1 ? ' (tomorrow)' : ' (in ' + days + ' days)') + '.';
    if (state.resetDay > 28) text += ' Shorter months reset on their last day.';
    els.resetHint.textContent = text;
  }

  function showEmptyState(title, text) {
    els.emptyTitle.textContent = title;
    els.emptyText.textContent = text;
    els.txEmpty.hidden = false;
  }

  function createTransactionItem(t) {
    const li = document.createElement('li');
    li.className = 'txitem';
    li.dataset.id = t.id;

    const isIncome = t.type === 'income';

    const icon = document.createElement('span');
    icon.className = 'txicon ' + t.type;
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = isIncome ? '\u2193' : '\u2191';

    const body = document.createElement('div');
    body.className = 'txbody';

    const desc = document.createElement('p');
    desc.className = 'txdesc';
    desc.textContent = t.description;

    const meta = document.createElement('div');
    meta.className = 'txmeta';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'txtype ' + t.type;
    typeBadge.textContent = isIncome ? 'Income' : 'Expense';

    const category = document.createElement('span');
    category.className = 'txcat';
    category.textContent = t.category;

    const time = document.createElement('time');
    time.setAttribute('datetime', t.date);
    time.textContent = formatDate(t.date);

    meta.append(typeBadge, category, time);
    body.append(desc, meta);

    const side = document.createElement('div');
    side.className = 'txside';

    const amount = document.createElement('span');
    amount.className = 'txamount ' + t.type;
    amount.textContent = (isIncome ? '+' : '-') + formatTND(toMillimes(t.amount));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'txdelete';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', 'Delete transaction: ' + t.description);

    side.append(amount, del);
    li.append(icon, body, side);
    return li;
  }

  function sortedByDate(list) {
    // Array.sort is stable, so transactions added later (stored earlier in
    // the array) stay above older ones with the same date.
    return list.slice().sort(function (a, b) {
      if (a.date === b.date) return 0;
      return a.date < b.date ? 1 : -1;
    });
  }

  function renderTransactions() {
    els.txList.replaceChildren();
    els.txEmpty.hidden = true;

    if (state.transactions.length === 0) {
      showEmptyState('No transactions yet', 'Your transactions will appear here.');
      return;
    }

    const visible = state.transactions.filter(function (t) {
      return state.filter === 'all' || t.type === state.filter;
    });

    if (visible.length === 0) {
      showEmptyState('No matching transactions', 'Try selecting a different filter.');
      return;
    }

    sortedByDate(visible).forEach(function (t) {
      els.txList.appendChild(createTransactionItem(t));
    });
  }

  function renderAll() {
    const totals = getTotals();
    renderWelcome(totals);
    renderSummary(totals);
    renderBalancePanel(totals);
    renderResetHint(totals);
    renderTransactions();
  }

  /* ----------------------------------------------------------
     FORM HELPERS
     ---------------------------------------------------------- */
  function populateCategories(type, keepValue) {
    const list = CATEGORIES[type] || [];
    els.category.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a category';
    els.category.appendChild(placeholder);

    list.forEach(function (name) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      els.category.appendChild(option);
    });

    els.category.value = list.indexOf(keepValue) !== -1 ? keepValue : '';
  }

  function populateResetDays() {
    els.resetSelect.replaceChildren();
    for (let day = 1; day <= 31; day++) {
      const option = document.createElement('option');
      option.value = String(day);
      option.textContent = String(day);
      els.resetSelect.appendChild(option);
    }
    els.resetSelect.value = String(state.resetDay);
  }

  function refreshDateField() {
    els.date.max = todayString();
  }

  function resetForm() {
    els.form.reset();
    populateCategories('expense');
    els.date.value = todayString();
    refreshDateField();
  }

  function clearInvalidMarks() {
    els.form.querySelectorAll('[aria-invalid]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
  }

  function fail(message, field) {
    return { error: message, field: field };
  }

  // Returns { tx } when valid, or { error, field } when not.
  function readAndValidateForm() {
    const type = els.form.elements.type.value;
    if (type !== 'income' && type !== 'expense') {
      return fail('Choose whether this is income or an expense.', null);
    }

    // Amount
    if (els.amount.validity.badInput) {
      return fail('Enter the amount as a number, for example 25.000.', els.amount);
    }
    const parsed = parseAmount(els.amount.value);
    if (parsed.error) return fail(parsed.error, els.amount);

    // Category
    const category = els.category.value;
    if (CATEGORIES[type].indexOf(category) === -1) {
      return fail('Select a category.', els.category);
    }

    // Description
    const description = els.description.value.trim();
    if (description === '') {
      return fail('Enter a short description.', els.description);
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return fail('Keep the description under ' + MAX_DESCRIPTION_LENGTH + ' characters.', els.description);
    }

    // Date
    const date = els.date.value;
    if (date === '') return fail('Choose a date.', els.date);
    if (!isValidDateString(date)) return fail('Enter a valid date.', els.date);
    if (date > todayString()) return fail('The date can\u2019t be in the future.', els.date);

    return {
      tx: {
        id: generateId(),
        type: type,
        amount: parsed.value,
        category: category,
        description: description,
        date: date
      }
    };
  }

  /* ----------------------------------------------------------
     PART G: USER ACTIONS
     ---------------------------------------------------------- */
  function handleAddTransaction(event) {
    event.preventDefault();
    clearInvalidMarks();
    clearFormMessage();
    refreshDateField();

    const result = readAndValidateForm();
    if (result.error) {
      showFormMessage(result.error, 'error');
      if (result.field) {
        result.field.setAttribute('aria-invalid', 'true');
        result.field.focus();
      }
      return;
    }

    const tx = result.tx;
    const nextList = [tx].concat(state.transactions);

    if (!saveTransactions(nextList)) {
      showFormMessage('Couldn\u2019t save this transaction because browser storage isn\u2019t available. Nothing was added.', 'error');
      return;
    }

    state.transactions = nextList;
    renderAll();
    resetForm();

    let message = 'Transaction added.';
    if (!isInPeriod(tx.date, getPeriod(0))) {
      message += ' It\u2019s from before your current period, so it isn\u2019t counted in the totals.';
    }
    if (state.filter !== 'all' && state.filter !== tx.type) {
      message += ' It\u2019s hidden by the current filter.';
    }
    showFormMessage(message, 'success');
  }

  function handleDelete(event) {
    const button = event.target.closest('.txdelete');
    if (!button) return;
    const item = button.closest('.txitem');
    if (!item) return;

    const id = item.dataset.id;
    const nextList = state.transactions.filter(function (t) { return t.id !== id; });

    if (!saveTransactions(nextList)) {
      showToast('Couldn\u2019t delete: browser storage isn\u2019t available.', 'error');
      return;
    }

    state.transactions = nextList;
    renderAll();
    showToast('Transaction deleted.', 'success');
  }

  function handleFilterChange() {
    state.filter = els.filterSelect.value;
    renderTransactions();
  }

  function handleResetDayChange() {
    const day = Number(els.resetSelect.value);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      els.resetSelect.value = String(state.resetDay);
      return;
    }
    if (!saveResetDay(day)) {
      els.resetSelect.value = String(state.resetDay);
      showToast('Couldn\u2019t save the reset day: browser storage isn\u2019t available.', 'error');
      return;
    }
    state.resetDay = day;
    renderAll();
    showToast('Reset day set to day ' + day + ' of the month.', 'success');
  }

  function handleTypeChange(event) {
    if (event.target.name !== 'type') return;
    populateCategories(event.target.value, els.category.value);
  }

  function handleFormInput(event) {
    if (event.target.removeAttribute) event.target.removeAttribute('aria-invalid');
    if (els.formMessage.classList.contains('success')) clearFormMessage();
  }

  function bindEvents() {
    els.form.addEventListener('submit', handleAddTransaction);
    els.form.addEventListener('change', handleTypeChange);
    els.form.addEventListener('input', handleFormInput);

    els.filterSelect.addEventListener('change', handleFilterChange);
    els.txList.addEventListener('click', handleDelete);
    els.resetSelect.addEventListener('change', handleResetDayChange);

    // Keep the period correct if the tab stays open past midnight
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        refreshDateField();
        renderAll();
      }
    });
  }

  /* ----------------------------------------------------------
     PART I: ASSISTANT CHATBOT
     A rule-based helper that reads the same data as the dashboard.
     It runs fully in the browser; nothing is sent anywhere.
     ---------------------------------------------------------- */
  const chatEls = {
    toggle: document.querySelector('#chatToggle'),
    panel: document.querySelector('#chatPanel'),
    close: document.querySelector('#chatClose'),
    log: document.querySelector('#chatLog'),
    chips: document.querySelector('#chatChips'),
    form: document.querySelector('#chatForm'),
    input: document.querySelector('#chatInput')
  };

  const CHAT_SUGGESTIONS = [
    'What is my balance?',
    'When does my period reset?',
    'Where does my money go?',
    'Show recent transactions',
    'Give me a saving tip'
  ];

  const CHAT_CATEGORY_PATTERNS = [
    ['Food', /\b(food|grocer\w*|restaurants?|meals?|eat\w*)\b/],
    ['Transport', /\b(transport\w*|bus|buses|taxis?|fuel|petrol|metro|train)\b/],
    ['Shopping', /\b(shopping|clothes|clothing)\b/],
    ['Bills', /\b(bills?|electricity|internet|rent)\b/],
    ['Salary', /\b(salary|salaries|wages?|paycheck)\b/],
    ['Other', /\bother\b/]
  ];

  const CHAT_HOWTO = {
    add: 'Use the Add Transaction form: choose Expense or Income, enter the amount, pick a category, add a short description and a date, then press + Add Transaction.',
    remove: 'Press Delete next to a transaction in Transaction History. Your totals and available balance update straight away.',
    reset: 'Use the Reset day section in the top panel. Pick the day of the month your income arrives, and your totals start again on that day.',
    budget: 'There\u2019s no fixed budget to edit. Your available balance is your income minus your expenses for the current period, so adding income raises it. You can change when it resets in the Reset day section.',
    filter: 'Use the dropdown at the top of Transaction History to show All, Income or Expenses. Filtering never deletes anything or changes your totals.',
    storage: 'Everything is stored in this browser only. It isn\u2019t synced to other devices or backed up online, and clearing your browser data will remove it.'
  };

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function percentOf(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }

  function describeTransaction(t) {
    const sign = t.type === 'income' ? '+' : '-';
    return formatDate(t.date) + ': ' + t.description + ' (' + t.category + '), ' +
      sign + formatTND(toMillimes(t.amount));
  }

  function findCategory(text) {
    for (let i = 0; i < CHAT_CATEGORY_PATTERNS.length; i++) {
      if (CHAT_CATEGORY_PATTERNS[i][1].test(text)) return CHAT_CATEGORY_PATTERNS[i][0];
    }
    return null;
  }

  function isHowTo(text) {
    return /\bhow (do|can|should|to)\b|\bwhere (do|can) i\b|\bcan i (add|delete|remove|edit|change|filter|set)\b/.test(text);
  }

  function howToKey(text) {
    if (/delete|remove/.test(text)) return 'remove';
    if (/reset|payday|period/.test(text)) return 'reset';
    if (/budget/.test(text)) return 'budget';
    if (/filter|show only/.test(text)) return 'filter';
    if (/\b(add|record|log|enter|create|input)\b/.test(text)) return 'add';
    if (/\b(data|save|saved|store|stored|backup|sync|device)\b/.test(text)) return 'storage';
    return null;
  }

  /* ---- Replies ---- */
  function replyGreeting() {
    return 'Hi! Ask me about your balance, spending by category or recent transactions. I can also explain how to use SmartSpend.';
  }

  function replyHelp() {
    return 'Here\u2019s what I can do:\n' +
      '- Show your available balance, income and expenses\n' +
      '- Tell you when your period resets and your daily allowance\n' +
      '- Break down spending by category (try \u201cHow much on food?\u201d)\n' +
      '- List recent transactions or your biggest expense\n' +
      '- Compare with the previous period\n' +
      '- Check a purchase (try \u201cCan I afford 50?\u201d)\n' +
      '- Explain how to add, delete, filter or set the reset day';
  }

  function replyHowTo(text) {
    return CHAT_HOWTO[howToKey(text)];
  }

  function replyBalance() {
    const t = getTotals();
    const lines = [
      'Your available balance is ' + formatTND(t.available) + '.',
      'Income ' + formatTND(t.income) + ' minus expenses ' + formatTND(t.expenses) +
        ' for ' + periodLabel(t.period) + '.'
    ];
    if (t.shortfall > 0) {
      lines.push('You\u2019ve spent ' + formatTND(t.shortfall) + ' more than you received, so the balance shows 0.');
    } else if (t.available > 0) {
      const days = daysBetween(todayString(), t.period.end);
      lines.push('That\u2019s about ' + formatTND(Math.floor(t.available / days)) +
        ' per day for the ' + plural(days, 'day') + ' until your next reset.');
    }
    return lines.join('\n');
  }

  function replyReset() {
    const t = getTotals();
    const days = daysBetween(todayString(), t.period.end);
    let text = 'Your totals reset on day ' + state.resetDay + ' of each month. The next reset is ' +
      formatDate(t.period.end) + ', ' + (days === 1 ? 'tomorrow' : 'in ' + days + ' days') + '.';
    if (state.resetDay > 28) text += ' Shorter months reset on their last day.';
    return text + '\nYou can change it in the Reset day section at the top.';
  }

  function replyIncome() {
    const list = periodTransactions(getPeriod(0), 'income');
    if (list.length === 0) return 'You haven\u2019t recorded any income ' + periodWord() + ' yet.';
    return 'You\u2019ve received ' + formatTND(sumMillimes(list)) + ' ' + periodWord() +
      ' across ' + plural(list.length, 'income transaction') + '.';
  }

  function replyExpenses() {
    const t = getTotals();
    const count = periodTransactions(t.period, 'expense').length;
    if (count === 0) return 'You haven\u2019t recorded any expenses ' + periodWord() + ' yet.';
    let text = 'You\u2019ve spent ' + formatTND(t.expenses) + ' ' + periodWord() +
      ' across ' + plural(count, 'expense') + '.';
    if (t.income > 0) text += '\nThat\u2019s ' + Math.round(t.percent) + '% of your income.';
    return text;
  }

  function replyCategory(text) {
    const category = findCategory(text);
    const period = getPeriod(0);
    const expenses = sumMillimes(periodTransactions(period, 'expense').filter(function (t) { return t.category === category; }));
    const income = sumMillimes(periodTransactions(period, 'income').filter(function (t) { return t.category === category; }));
    const totalExpenses = sumMillimes(periodTransactions(period, 'expense'));

    if (expenses === 0 && income === 0) {
      return 'I don\u2019t see any ' + category + ' transactions ' + periodWord() + '.';
    }
    const lines = [];
    if (expenses > 0) {
      lines.push('You\u2019ve spent ' + formatTND(expenses) + ' on ' + category + ' ' + periodWord() +
        ' (' + percentOf(expenses, totalExpenses) + '% of your spending).');
    }
    if (income > 0) {
      lines.push('You\u2019ve received ' + formatTND(income) + ' in ' + category + ' income ' + periodWord() + '.');
    }
    return lines.join('\n');
  }

  function replyTopCategories() {
    const list = periodTransactions(getPeriod(0), 'expense');
    if (list.length === 0) return 'No expenses recorded ' + periodWord() + ' yet.';

    const totals = {};
    list.forEach(function (t) {
      totals[t.category] = (totals[t.category] || 0) + toMillimes(t.amount);
    });
    const total = sumMillimes(list);
    const rows = Object.keys(totals)
      .sort(function (a, b) { return totals[b] - totals[a]; })
      .slice(0, 4)
      .map(function (name) {
        return name + ': ' + formatTND(totals[name]) + ' (' + percentOf(totals[name], total) + '%)';
      });
    return 'Your spending ' + periodWord() + ', biggest first:\n' + rows.join('\n');
  }

  function replyLargest(text) {
    const type = /income|salary|earn|received/.test(text) ? 'income' : 'expense';
    const list = periodTransactions(getPeriod(0), type);
    if (list.length === 0) return 'You haven\u2019t recorded any ' + type + ' ' + periodWord() + ' yet.';
    const biggest = list.reduce(function (best, t) {
      return toMillimes(t.amount) > toMillimes(best.amount) ? t : best;
    });
    return 'Your largest ' + type + ' ' + periodWord() + ':\n' + describeTransaction(biggest);
  }

  function replyRecent() {
    if (state.transactions.length === 0) return 'You haven\u2019t added any transactions yet.';
    const recent = sortedByDate(state.transactions).slice(0, 3);
    return 'Your latest transactions:\n' + recent.map(describeTransaction).join('\n');
  }

  function replyCount() {
    const all = state.transactions.length;
    if (all === 0) return 'You haven\u2019t added any transactions yet.';
    const inPeriod = periodTransactions(getPeriod(0)).length;
    return 'You have ' + plural(all, 'transaction') + ' saved, ' + inPeriod + ' of them ' + periodWord() + '.';
  }

  function replyPrevious() {
    const prevPeriod = getPeriod(-1);
    const prev = periodTransactions(prevPeriod);
    if (prev.length === 0) return 'I don\u2019t have any transactions for the previous period (' + periodLabel(prevPeriod) + ').';

    const prevIncome = sumMillimes(prev.filter(function (t) { return t.type === 'income'; }));
    const prevExpenses = sumMillimes(prev.filter(function (t) { return t.type === 'expense'; }));
    const t = getTotals();

    const lines = [
      'Previous period (' + periodLabel(prevPeriod) + '): income ' + formatTND(prevIncome) +
        ', spending ' + formatTND(prevExpenses) + '.',
      'So far ' + periodWord() + ': income ' + formatTND(t.income) + ', spending ' + formatTND(t.expenses) + '.'
    ];
    if (prevExpenses > 0) {
      const diff = t.expenses - prevExpenses;
      const pct = percentOf(Math.abs(diff), prevExpenses);
      if (diff === 0) lines.push('Your spending is the same as the whole previous period.');
      else lines.push('Your spending so far is ' + pct + '% ' + (diff > 0 ? 'higher' : 'lower') + ' than the whole previous period.');
    }
    return lines.join('\n');
  }

  function replyWhatIf(text) {
    const match = text.match(/(\d+(?:[.,]\d{1,3})?)/);
    const amount = match ? toMillimes(Number(match[1].replace(',', '.'))) : 0;
    if (amount <= 0) return 'Tell me the amount and I\u2019ll check it, for example: \u201cCan I afford 50?\u201d';

    const t = getTotals();
    const lines = [];
    if (amount <= t.available) {
      lines.push('Spending ' + formatTND(amount) + ' would leave ' + formatTND(t.available - amount) +
        ' of your available balance (now ' + formatTND(t.available) + ').');
    } else {
      lines.push('That\u2019s ' + formatTND(amount - t.available) + ' more than your available balance of ' +
        formatTND(t.available) + '.');
    }
    lines.push('That\u2019s just the arithmetic. The decision is yours.');
    return lines.join('\n');
  }

  function replyStorage() {
    return CHAT_HOWTO.storage + '\nThis assistant also runs in your browser, so your questions and data aren\u2019t sent anywhere.';
  }

  function replyTips() {
    const t = getTotals();
    if (t.income === 0 && t.expenses === 0) {
      return 'Add a few transactions first and I can tailor tips to you. A good start is recording every expense for a week.';
    }
    const lines = [];

    const byCategory = {};
    periodTransactions(t.period, 'expense').forEach(function (tx) {
      byCategory[tx.category] = (byCategory[tx.category] || 0) + toMillimes(tx.amount);
    });
    let topName = null;
    let topAmount = 0;
    Object.keys(byCategory).forEach(function (name) {
      if (byCategory[name] > topAmount) { topAmount = byCategory[name]; topName = name; }
    });

    if (t.shortfall > 0) {
      lines.push('You\u2019ve spent ' + formatTND(t.shortfall) + ' more than you received. Pause non-essential purchases until your next income or reset.');
    } else if (t.income > 0 && t.percent >= 80) {
      lines.push('You\u2019ve used ' + Math.round(t.percent) + '% of your income. Try to keep the remaining ' + formatTND(t.available) + ' for essentials.');
    } else if (t.income > 0) {
      lines.push('You\u2019ve used ' + Math.round(t.percent) + '% of your income, which looks on track.');
    }
    if (topName) {
      lines.push(topName + ' is your biggest category at ' + formatTND(topAmount) + '. Small cuts there make the biggest difference.');
    }
    if (t.income > 0 && t.available > 0) {
      lines.push('You kept ' + percentOf(t.available, t.income) + '% of your income. Moving part of it aside as soon as you\u2019re paid makes saving easier.');
    }
    lines.push('These are general tips, not financial advice.');
    return lines.join('\n');
  }

  function replyThanks() {
    return 'You\u2019re welcome!';
  }

  function replyFallback() {
    return 'I\u2019m not sure about that one. I can answer questions about your balance, categories and transactions, or explain how to use SmartSpend. Try one of the suggestions below, or type \u201chelp\u201d.';
  }

  // Order matters: the first matching rule answers.
  const CHAT_RULES = [
    { match: function (t) { return /^(hi|hello|hey|salam|salut|bonjour|good (morning|afternoon|evening))\b/.test(t); }, reply: replyGreeting },
    { match: function (t) { return /\b(thanks|thank you|merci|shukran)\b/.test(t); }, reply: replyThanks },
    { match: function (t) { return /\b(help|what can you|what do you do|commands)\b/.test(t); }, reply: replyHelp },
    { match: function (t) { return isHowTo(t) && howToKey(t) !== null; }, reply: replyHowTo },
    { match: function (t) { return /\b(afford|can i (buy|spend)|if i (buy|spend))\b/.test(t); }, reply: replyWhatIf },
    { match: function (t) { return /\b(last|previous) (month|period)\b|\bcompare\b/.test(t); }, reply: replyPrevious },
    { match: function (t) { return /\bhow many\b.*\b(transactions?|entries|records)\b/.test(t); }, reply: replyCount },
    { match: function (t) { return /\breset\b|payday|new period|start again/.test(t); }, reply: replyReset },
    { match: function (t) { return /categor|breakdown|top spending|where (does|did|is) (my|the) money|most on\b/.test(t); }, reply: replyTopCategories },
    { match: function (t) { return /\b(largest|biggest|highest|most expensive)\b/.test(t); }, reply: replyLargest },
    { match: function (t) { return /\b(latest|recent|newest)\b/.test(t) || (/\blast\b/.test(t) && /(transaction|purchase|expense|income|entries|few)/.test(t)); }, reply: replyRecent },
    { match: function (t) { return /balance|budget|remaining|left to spend|overspend|exceed|how much (money )?(do i have|have i got)/.test(t); }, reply: replyBalance },
    { match: function (t) { return findCategory(t) !== null; }, reply: replyCategory },
    { match: function (t) { return /\b(income|earn\w*|received|receive)\b/.test(t); }, reply: replyIncome },
    { match: function (t) { return /\b(spent|spend\w*|expenses?|paid|costs?)\b/.test(t); }, reply: replyExpenses },
    { match: function (t) { return /\b(data|storage|backup|sync|private|privacy|stored|offline)\b/.test(t); }, reply: replyStorage },
    { match: function (t) { return /\b(tips?|advice|advise|save|saving|savings|suggest\w*|improve|reduce|cut)\b/.test(t); }, reply: replyTips }
  ];

  function assistantAnswer(question) {
    const text = question.toLowerCase().replace(/\s+/g, ' ').trim();
    for (let i = 0; i < CHAT_RULES.length; i++) {
      if (CHAT_RULES[i].match(text)) return CHAT_RULES[i].reply(text);
    }
    return replyFallback();
  }

  /* ---- Chat interface ---- */
  function addChatMessage(who, text) {
    const bubble = document.createElement('div');
    bubble.className = 'chatmsg ' + who;
    bubble.textContent = text;
    chatEls.log.appendChild(bubble);
    while (chatEls.log.children.length > 60) {
      chatEls.log.removeChild(chatEls.log.firstChild);
    }
    chatEls.log.scrollTop = chatEls.log.scrollHeight;
    return bubble;
  }

  function askAssistant(question) {
    const text = question.trim();
    if (text === '') return;

    addChatMessage('user', text);
    const typing = addChatMessage('bot typing', 'Typing\u2026');

    window.setTimeout(function () {
      let reply;
      try {
        reply = assistantAnswer(text);
      } catch (e) {
        reply = 'Sorry, something went wrong while reading your data. Please try again.';
      }
      typing.className = 'chatmsg bot';
      typing.textContent = reply;
      chatEls.log.scrollTop = chatEls.log.scrollHeight;
    }, 350);
  }

  function setChatOpen(open) {
    chatEls.panel.hidden = !open;
    chatEls.toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      chatEls.input.focus();
      chatEls.log.scrollTop = chatEls.log.scrollHeight;
    } else {
      chatEls.toggle.focus();
    }
  }

  function initChat() {
    addChatMessage('bot', 'Hi, I\u2019m the SmartSpend assistant. Ask me about your balance or spending, or how to use the app.');

    CHAT_SUGGESTIONS.forEach(function (label) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chatchip';
      chip.textContent = label;
      chip.addEventListener('click', function () { askAssistant(label); });
      chatEls.chips.appendChild(chip);
    });

    chatEls.toggle.addEventListener('click', function () {
      setChatOpen(chatEls.panel.hidden);
    });
    chatEls.close.addEventListener('click', function () { setChatOpen(false); });
    chatEls.panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setChatOpen(false);
    });
    chatEls.form.addEventListener('submit', function (event) {
      event.preventDefault();
      const value = chatEls.input.value;
      chatEls.input.value = '';
      askAssistant(value);
    });
  }

  /* ----------------------------------------------------------
     PART H: INITIALIZE
     ---------------------------------------------------------- */
  function init() {
    els.date.value = todayString();
    refreshDateField();
    populateCategories('expense');

    setStorageStatus(storageAvailable());

    state.transactions = loadTransactions();
    state.resetDay = loadResetDay();
    state.filter = els.filterSelect.value;

    populateResetDays();
    renderAll();
    bindEvents();
    initChat();
  }

  init();
})();
