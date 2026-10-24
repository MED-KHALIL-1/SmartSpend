/* ==========================================================
   SmartSpend - controle.js
   Handles data, calculations, validation, storage and the UI.
   ========================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     CONSTANTS
     ---------------------------------------------------------- */
  const STORAGE_KEYS = {
    transactions: 'smartSpendTransactions',
    budget: 'smartSpendMonthlyBudget'
  };

  const DEFAULT_BUDGET = 500;            // TND
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

    budgetAmount: document.querySelector('#budgetAmount'),
    editBudgetBtn: document.querySelector('.editbud'),
    progBar: document.querySelector('.progbar'),
    progFill: document.querySelector('.progfill'),
    spentValue: document.querySelector('#spentValue'),
    budStatus: document.querySelector('#budStatus'),
    remainingValue: document.querySelector('#remainingValue'),

    balanceValue: document.querySelector('#balanceValue'),
    incomeValue: document.querySelector('#incomeValue'),
    expenseValue: document.querySelector('#expenseValue'),

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

    budgetDialog: document.querySelector('#budgetDialog'),
    budgetForm: document.querySelector('#budgetForm'),
    budgetInput: document.querySelector('#budgetInput'),
    budgetError: document.querySelector('#budgetError'),
    budgetCancel: document.querySelector('#budgetCancel'),

    toast: document.querySelector('#toast')
  };

  /* ----------------------------------------------------------
     PART B: APPLICATION DATA
     Each transaction: { id, type, amount, category, description, date }
     amount is a number in TND; calculations use integer millimes.
     ---------------------------------------------------------- */
  const state = {
    transactions: [],
    budget: DEFAULT_BUDGET,
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

  function saveBudget(value) {
    const ok = storageWrite(STORAGE_KEYS.budget, String(value));
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

  function loadBudget() {
    const raw = storageRead(STORAGE_KEYS.budget);
    if (raw === null || raw.trim() === '') return DEFAULT_BUDGET;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_BUDGET;
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

  // Compares plain YYYY-MM strings, so time zones can't shift the month.
  function isCurrentMonth(dateStr) {
    return dateStr.slice(0, 7) === todayString().slice(0, 7);
  }

  function formatDate(dateStr) {
    const parts = dateStr.split('-').map(Number);
    return parts[2] + ' ' + MONTHS_SHORT[parts[1] - 1] + ' ' + parts[0];
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // Parses a TND string into a number with at most 3 decimals.
  // Returns { value } or { error }.
  function parseMoney(raw, label, options) {
    const text = String(raw).trim();
    if (text === '') return { error: 'Enter ' + label + '.' };

    const n = Number(text);
    if (!Number.isFinite(n)) {
      return { error: 'Enter ' + label + ' as a number, using a dot for decimals.' };
    }
    if (n < 0 || (n === 0 && !options.allowZero)) {
      return { error: options.allowZero
        ? label.charAt(0).toUpperCase() + label.slice(1) + ' can\u2019t be negative.'
        : 'Amount must be greater than zero.' };
    }
    if (n > MAX_AMOUNT) {
      return { error: 'The value can\u2019t be more than 999,999,999.999 TND.' };
    }
    const millimes = Math.round(n * 1000);
    if (Math.abs(n * 1000 - millimes) > 1e-6) {
      return { error: 'Use at most 3 decimal places.' };
    }
    return { value: millimes / 1000 };
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
  function currentMonthTotal(type) {
    return state.transactions
      .filter(function (t) { return t.type === type && isCurrentMonth(t.date); })
      .reduce(function (sum, t) { return sum + toMillimes(t.amount); }, 0);
  }

  function getTotals() {
    const income = currentMonthTotal('income');
    const expenses = currentMonthTotal('expense');
    const budget = toMillimes(state.budget);
    return {
      income: income,
      expenses: expenses,
      balance: income - expenses,
      budget: budget,
      remaining: budget - expenses,
      percent: budget > 0 ? (expenses / budget) * 100 : null
    };
  }

  /* ----------------------------------------------------------
     PART F: UPDATE THE INTERFACE
     ---------------------------------------------------------- */
  function renderWelcome() {
    const now = new Date();
    els.welcomeText.textContent =
      'Here\u2019s an overview of your finances for ' +
      MONTHS[now.getMonth()] + ' ' + now.getFullYear() + '.';
  }

  function renderSummary(totals) {
    els.balanceValue.textContent = formatTND(totals.balance);
    els.balanceValue.classList.toggle('neg', totals.balance < 0);
    els.incomeValue.textContent = formatTND(totals.income);
    els.expenseValue.textContent = formatTND(totals.expenses);
  }

  function renderBudget(totals) {
    const over = totals.expenses > totals.budget;

    let width;
    let statusText;
    if (totals.budget > 0) {
      const pct = Math.round(totals.percent);
      width = Math.min(100, totals.percent);
      statusText = over ? 'Over budget (' + pct + '% used)' : pct + '% used';
    } else {
      width = totals.expenses > 0 ? 100 : 0;
      statusText = over ? 'Over budget' : 'No budget set';
    }

    els.budgetAmount.textContent = formatTND(totals.budget);
    els.spentValue.textContent = formatTND(totals.expenses);
    els.remainingValue.textContent = formatTND(totals.remaining);
    els.remainingValue.classList.toggle('neg', totals.remaining < 0);

    els.progFill.style.width = width + '%';
    els.progFill.classList.toggle('over', over);

    els.budStatus.textContent = statusText;
    els.budStatus.classList.toggle('over', over);

    els.progBar.setAttribute('aria-valuenow', String(Math.round(width)));
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

    // Newest date first. Array.sort is stable, so transactions added later
    // (stored earlier in the array) stay above older ones with the same date.
    visible
      .slice()
      .sort(function (a, b) {
        if (a.date === b.date) return 0;
        return a.date < b.date ? 1 : -1;
      })
      .forEach(function (t) {
        els.txList.appendChild(createTransactionItem(t));
      });
  }

  function renderAll() {
    const totals = getTotals();
    renderWelcome();
    renderSummary(totals);
    renderBudget(totals);
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
    const parsed = parseMoney(els.amount.value, 'an amount', { allowZero: false });
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
    if (!isCurrentMonth(tx.date)) {
      message += ' It\u2019s from an earlier month, so it isn\u2019t counted in this month\u2019s totals.';
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

  function handleTypeChange(event) {
    if (event.target.name !== 'type') return;
    populateCategories(event.target.value, els.category.value);
  }

  function handleFormInput(event) {
    if (event.target.removeAttribute) event.target.removeAttribute('aria-invalid');
    if (els.formMessage.classList.contains('success')) clearFormMessage();
  }

  /* ---- Budget editing ---- */
  function applyBudget(value) {
    if (!saveBudget(value)) return false;
    state.budget = value;
    renderAll();
    showToast('Monthly budget updated.', 'success');
    return true;
  }

  function openBudgetEditor() {
    // Fallback for very old browsers without <dialog>
    if (typeof els.budgetDialog.showModal !== 'function') {
      const answer = window.prompt('Enter your new monthly budget in TND:', state.budget.toFixed(3));
      if (answer === null) return;
      const parsed = parseMoney(answer, 'a budget', { allowZero: true });
      if (parsed.error) {
        showToast(parsed.error, 'error');
        return;
      }
      if (!applyBudget(parsed.value)) {
        showToast('Couldn\u2019t save the budget: browser storage isn\u2019t available.', 'error');
      }
      return;
    }

    els.budgetError.textContent = '';
    els.budgetInput.value = state.budget.toFixed(3);
    els.budgetInput.removeAttribute('aria-invalid');
    els.budgetDialog.showModal();
    els.budgetInput.focus();
    els.budgetInput.select();
  }

  function handleBudgetSubmit(event) {
    event.preventDefault();
    els.budgetInput.removeAttribute('aria-invalid');

    if (els.budgetInput.validity.badInput) {
      els.budgetError.textContent = 'Enter the budget as a number, for example 500.000.';
      els.budgetInput.setAttribute('aria-invalid', 'true');
      return;
    }

    const parsed = parseMoney(els.budgetInput.value, 'a budget', { allowZero: true });
    if (parsed.error) {
      els.budgetError.textContent = parsed.error;
      els.budgetInput.setAttribute('aria-invalid', 'true');
      els.budgetInput.focus();
      return;
    }

    if (!applyBudget(parsed.value)) {
      els.budgetError.textContent = 'Couldn\u2019t save the budget because browser storage isn\u2019t available.';
      return;
    }
    els.budgetDialog.close();
  }

  function bindEvents() {
    els.form.addEventListener('submit', handleAddTransaction);
    els.form.addEventListener('change', handleTypeChange);
    els.form.addEventListener('input', handleFormInput);

    els.filterSelect.addEventListener('change', handleFilterChange);
    els.txList.addEventListener('click', handleDelete);

    els.editBudgetBtn.addEventListener('click', openBudgetEditor);
    els.budgetForm.addEventListener('submit', handleBudgetSubmit);
    els.budgetCancel.addEventListener('click', function () { els.budgetDialog.close(); });

    // Clicking the dark backdrop closes the dialog
    els.budgetDialog.addEventListener('click', function (event) {
      if (event.target === els.budgetDialog) els.budgetDialog.close();
    });

    // Keep "this month" correct if the tab stays open past midnight
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
    'How is my budget?',
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
    remove: 'Press Delete next to a transaction in Transaction History. Your totals and budget update straight away.',
    budget: 'Press Edit budget in the dark panel at the top, type the new monthly amount and press Save budget.',
    filter: 'Use the dropdown at the top of Transaction History to show All, Income or Expenses. Filtering never deletes anything or changes your totals.',
    storage: 'Everything is stored in this browser only. It isn\u2019t synced to other devices or backed up online, and clearing your browser data will remove it.'
  };

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function percentOf(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }

  // Month key like "2026-10", offset months from now (-1 = last month)
  function monthKeyFor(offset) {
    const d = new Date();
    const total = d.getFullYear() * 12 + d.getMonth() + offset;
    return Math.floor(total / 12) + '-' + pad((total % 12) + 1);
  }

  function monthName(key) {
    return MONTHS[Number(key.split('-')[1]) - 1];
  }

  function daysLeftInMonth() {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return last - d.getDate() + 1;
  }

  function monthTransactions(key, type) {
    return state.transactions.filter(function (t) {
      return t.date.slice(0, 7) === key && (!type || t.type === type);
    });
  }

  function sumMillimes(list) {
    return list.reduce(function (sum, t) { return sum + toMillimes(t.amount); }, 0);
  }

  function sortedByDate(list) {
    return list.slice().sort(function (a, b) {
      if (a.date === b.date) return 0;
      return a.date < b.date ? 1 : -1;
    });
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
    return /\bhow (do|can|should|to)\b|\bwhere (do|can) i\b|\bcan i (add|delete|remove|edit|change|filter)\b/.test(text);
  }

  function howToKey(text) {
    if (/delete|remove/.test(text)) return 'remove';
    if (/budget/.test(text)) return 'budget';
    if (/filter|show only/.test(text)) return 'filter';
    if (/\b(add|record|log|enter|create|input)\b/.test(text)) return 'add';
    if (/\b(data|save|saved|store|stored|backup|sync|device)\b/.test(text)) return 'storage';
    return null;
  }

  /* ---- Replies ---- */
  function replyGreeting() {
    return 'Hi! Ask me about your balance, budget, spending by category or recent transactions. I can also explain how to use SmartSpend.';
  }

  function replyHelp() {
    return 'Here\u2019s what I can do:\n' +
      '- Show your balance, income and expenses this month\n' +
      '- Check your budget and daily allowance\n' +
      '- Break down spending by category (try \u201cHow much on food?\u201d)\n' +
      '- List recent transactions or your biggest expense\n' +
      '- Compare with last month\n' +
      '- Check a purchase (try \u201cCan I afford 50?\u201d)\n' +
      '- Explain how to add, delete, filter or edit your budget';
  }

  function replyHowTo(text) {
    return CHAT_HOWTO[howToKey(text)];
  }

  function replyBalance() {
    const t = getTotals();
    const lines = [
      'Your available balance for ' + monthName(monthKeyFor(0)) + ' is ' + formatTND(t.balance) + '.',
      'Income ' + formatTND(t.income) + ' minus expenses ' + formatTND(t.expenses) + '.'
    ];
    if (t.balance < 0) lines.push('Your expenses are higher than your income this month.');
    return lines.join('\n');
  }

  function replyBudget() {
    const t = getTotals();
    if (t.budget === 0) {
      return 'Your monthly budget is 0.000 TND, so there\u2019s nothing to measure against yet. Press Edit budget to set one.' +
        (t.expenses > 0 ? '\nYou\u2019ve spent ' + formatTND(t.expenses) + ' this month.' : '');
    }
    const lines = [
      'Budget: ' + formatTND(t.budget),
      'Spent: ' + formatTND(t.expenses) + ' (' + Math.round(t.percent) + '%)',
      'Remaining: ' + formatTND(t.remaining)
    ];
    if (t.remaining < 0) {
      lines.push('You\u2019re over budget by ' + formatTND(-t.remaining) + '.');
    } else if (t.remaining === 0) {
      lines.push('You\u2019ve used your whole budget.');
    } else {
      const left = daysLeftInMonth();
      lines.push('That\u2019s about ' + formatTND(Math.floor(t.remaining / left)) +
        ' per day for the remaining ' + plural(left, 'day') + '.');
    }
    return lines.join('\n');
  }

  function replyIncome() {
    const list = monthTransactions(monthKeyFor(0), 'income');
    if (list.length === 0) return 'You haven\u2019t recorded any income this month yet.';
    return 'This month you\u2019ve received ' + formatTND(sumMillimes(list)) +
      ' across ' + plural(list.length, 'income transaction') + '.';
  }

  function replyExpenses() {
    const t = getTotals();
    const count = monthTransactions(monthKeyFor(0), 'expense').length;
    if (count === 0) return 'You haven\u2019t recorded any expenses this month yet.';
    let text = 'This month you\u2019ve spent ' + formatTND(t.expenses) +
      ' across ' + plural(count, 'expense') + '.';
    if (t.budget > 0) text += '\nThat\u2019s ' + Math.round(t.percent) + '% of your monthly budget.';
    return text;
  }

  function replyCategory(text) {
    const category = findCategory(text);
    const key = monthKeyFor(0);
    const month = monthName(key);
    const expenses = sumMillimes(monthTransactions(key, 'expense').filter(function (t) { return t.category === category; }));
    const income = sumMillimes(monthTransactions(key, 'income').filter(function (t) { return t.category === category; }));
    const totalExpenses = sumMillimes(monthTransactions(key, 'expense'));

    if (expenses === 0 && income === 0) {
      return 'I don\u2019t see any ' + category + ' transactions in ' + month + '.';
    }
    const lines = [];
    if (expenses > 0) {
      lines.push('You\u2019ve spent ' + formatTND(expenses) + ' on ' + category + ' in ' + month +
        ' (' + percentOf(expenses, totalExpenses) + '% of your spending).');
    }
    if (income > 0) {
      lines.push('You\u2019ve received ' + formatTND(income) + ' in ' + category + ' income in ' + month + '.');
    }
    return lines.join('\n');
  }

  function replyTopCategories() {
    const key = monthKeyFor(0);
    const list = monthTransactions(key, 'expense');
    if (list.length === 0) return 'No expenses recorded in ' + monthName(key) + ' yet.';

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
    return 'Your spending in ' + monthName(key) + ', biggest first:\n' + rows.join('\n');
  }

  function replyLargest(text) {
    const type = /income|salary|earn|received/.test(text) ? 'income' : 'expense';
    const list = monthTransactions(monthKeyFor(0), type);
    if (list.length === 0) return 'You haven\u2019t recorded any ' + type + ' this month yet.';
    const biggest = list.reduce(function (best, t) {
      return toMillimes(t.amount) > toMillimes(best.amount) ? t : best;
    });
    return 'Your largest ' + type + ' this month:\n' + describeTransaction(biggest);
  }

  function replyRecent() {
    if (state.transactions.length === 0) return 'You haven\u2019t added any transactions yet.';
    const recent = sortedByDate(state.transactions).slice(0, 3);
    return 'Your latest transactions:\n' + recent.map(describeTransaction).join('\n');
  }

  function replyCount() {
    const all = state.transactions.length;
    if (all === 0) return 'You haven\u2019t added any transactions yet.';
    const thisMonth = monthTransactions(monthKeyFor(0)).length;
    return 'You have ' + plural(all, 'transaction') + ' saved, ' + thisMonth + ' of them in ' +
      monthName(monthKeyFor(0)) + '.';
  }

  function replyLastMonth() {
    const prevKey = monthKeyFor(-1);
    const prev = monthTransactions(prevKey);
    if (prev.length === 0) return 'I don\u2019t have any transactions for ' + monthName(prevKey) + '.';

    const prevIncome = sumMillimes(prev.filter(function (t) { return t.type === 'income'; }));
    const prevExpenses = sumMillimes(prev.filter(function (t) { return t.type === 'expense'; }));
    const t = getTotals();

    const lines = [
      monthName(prevKey) + ': income ' + formatTND(prevIncome) + ', spending ' + formatTND(prevExpenses) + '.',
      'This month so far: income ' + formatTND(t.income) + ', spending ' + formatTND(t.expenses) + '.'
    ];
    if (prevExpenses > 0) {
      const diff = t.expenses - prevExpenses;
      const pct = percentOf(Math.abs(diff), prevExpenses);
      if (diff === 0) lines.push('Your spending is the same as last month.');
      else lines.push('Your spending is ' + pct + '% ' + (diff > 0 ? 'higher' : 'lower') + ' than all of last month.');
    }
    return lines.join('\n');
  }

  function replyWhatIf(text) {
    const match = text.match(/(\d+(?:[.,]\d{1,3})?)/);
    const amount = match ? toMillimes(Number(match[1].replace(',', '.'))) : 0;
    if (amount <= 0) return 'Tell me the amount and I\u2019ll check it, for example: \u201cCan I afford 50?\u201d';

    const t = getTotals();
    const lines = [];
    const budgetAfter = t.remaining - amount;
    if (t.budget > 0) {
      lines.push(budgetAfter >= 0
        ? 'Spending ' + formatTND(amount) + ' would leave ' + formatTND(budgetAfter) + ' of your budget.'
        : 'Spending ' + formatTND(amount) + ' would put you over budget by ' + formatTND(-budgetAfter) + '.');
    }
    lines.push('Your available balance would go from ' + formatTND(t.balance) + ' to ' + formatTND(t.balance - amount) + '.');
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
    const key = monthKeyFor(0);
    const expenses = monthTransactions(key, 'expense');

    let topName = null;
    let topAmount = 0;
    const byCategory = {};
    expenses.forEach(function (tx) {
      byCategory[tx.category] = (byCategory[tx.category] || 0) + toMillimes(tx.amount);
    });
    Object.keys(byCategory).forEach(function (name) {
      if (byCategory[name] > topAmount) { topAmount = byCategory[name]; topName = name; }
    });

    if (t.expenses > t.budget) {
      lines.push('You\u2019re over budget' + (t.budget > 0 ? ' by ' + formatTND(t.expenses - t.budget) : '') + '. Pause non-essential purchases for the rest of the month.');
    } else if (t.budget > 0 && t.percent >= 80) {
      lines.push('You\u2019ve used ' + Math.round(t.percent) + '% of your budget. Try to keep the remaining ' + formatTND(t.remaining) + ' for essentials.');
    } else if (t.budget > 0) {
      lines.push('You\u2019re at ' + Math.round(t.percent) + '% of your budget, which is on track.');
    }
    if (topName) {
      lines.push(topName + ' is your biggest category at ' + formatTND(topAmount) + '. Small cuts there make the biggest difference.');
    }
    if (t.income > 0 && t.balance > 0) {
      lines.push('You kept ' + percentOf(t.balance, t.income) + '% of your income this month. Moving part of it aside as soon as you\u2019re paid makes saving easier.');
    }
    lines.push('These are general tips, not financial advice.');
    return lines.join('\n');
  }

  function replyThanks() {
    return 'You\u2019re welcome!';
  }

  function replyFallback() {
    return 'I\u2019m not sure about that one. I can answer questions about your balance, budget, categories and transactions, or explain how to use SmartSpend. Try one of the suggestions below, or type \u201chelp\u201d.';
  }

  // Order matters: the first matching rule answers.
  const CHAT_RULES = [
    { match: function (t) { return /^(hi|hello|hey|salam|salut|bonjour|good (morning|afternoon|evening))\b/.test(t); }, reply: replyGreeting },
    { match: function (t) { return /\b(thanks|thank you|merci|shukran)\b/.test(t); }, reply: replyThanks },
    { match: function (t) { return /\b(help|what can you|what do you do|commands)\b/.test(t); }, reply: replyHelp },
    { match: function (t) { return isHowTo(t) && howToKey(t) !== null; }, reply: replyHowTo },
    { match: function (t) { return /\b(afford|can i (buy|spend)|if i (buy|spend))\b/.test(t); }, reply: replyWhatIf },
    { match: function (t) { return /\b(last|previous) month\b|\bcompare\b/.test(t); }, reply: replyLastMonth },
    { match: function (t) { return /\bhow many\b.*\b(transactions?|entries|records)\b/.test(t); }, reply: replyCount },
    { match: function (t) { return /categor|breakdown|top spending|where (does|did|is) (my|the) money|most on\b/.test(t); }, reply: replyTopCategories },
    { match: function (t) { return /\b(largest|biggest|highest|most expensive)\b/.test(t); }, reply: replyLargest },
    { match: function (t) { return /\b(latest|recent|newest)\b/.test(t) || (/\blast\b/.test(t) && /(transaction|purchase|expense|income|entries|few)/.test(t)); }, reply: replyRecent },
    { match: function (t) { return /budget|remaining|left to spend|overspend|exceed/.test(t); }, reply: replyBudget },
    { match: function (t) { return findCategory(t) !== null; }, reply: replyCategory },
    { match: function (t) { return /balance|how much (money )?(do i have|have i got)/.test(t); }, reply: replyBalance },
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
    addChatMessage('bot', 'Hi, I\u2019m the SmartSpend assistant. Ask me about your balance, budget or spending, or how to use the app.');

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
    state.budget = loadBudget();
    state.filter = els.filterSelect.value;

    renderAll();
    bindEvents();
    initChat();
  }

  init();
})();
