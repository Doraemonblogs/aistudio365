/*
 * Adds a 商家联系方式 card (QQ + WeChat with copy buttons) to the bottom of the guest order
 * detail page (/guest/orders/<order no>), like the old wzyp order page.
 */
(function () {
  if (window.__aisOrderContact) return;
  window.__aisOrderContact = true;

  var CONTACTS = [
    { label: 'QQ', value: '3090503843' },
    { label: '微信', value: 'aistudio361' }
  ];
  var NOTE = '付款后请添加客服微信，发送「付款截图 + 订单号」。客服确认收款并办理后，刷新本页即可看到交付内容和使用说明。';

  function copy(text, button) {
    function done() {
      var old = button.textContent;
      button.textContent = '已复制';
      setTimeout(function () { button.textContent = old; }, 1200);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {});
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function buildCard() {
    var card = document.createElement('div');
    card.setAttribute('data-ais-contact', '1');
    card.className = 'rounded-2xl border bg-card p-6 shadow-sm mb-8';

    var title = document.createElement('h2');
    title.className = 'text-lg font-bold mb-2';
    title.textContent = '商家联系方式';
    card.appendChild(title);

    var note = document.createElement('p');
    note.className = 'text-sm text-muted-foreground mb-4';
    note.textContent = NOTE;
    card.appendChild(note);

    CONTACTS.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'border-t';
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0';
      var text = document.createElement('div');
      text.className = 'text-sm';
      var label = document.createElement('span');
      label.className = 'text-muted-foreground';
      label.textContent = c.label + '：';
      var value = document.createElement('span');
      value.className = 'font-semibold text-foreground';
      value.textContent = c.value;
      text.appendChild(label);
      text.appendChild(value);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-sm text-primary';
      button.textContent = '复制';
      button.addEventListener('click', function () { copy(c.value, button); });
      row.appendChild(text);
      row.appendChild(button);
      card.appendChild(row);
    });
    return card;
  }

  function place() {
    if (!/^\/guest\/orders\/[^/]+\/?$/.test(location.pathname)) return;
    var headings = document.querySelectorAll('h1');
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].textContent.indexOf('游客订单详情') === -1) continue;
      var container = headings[i].closest('.container');
      if (container && !container.querySelector('[data-ais-contact]')) container.appendChild(buildCard());
      return;
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; place(); }, 50);
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  place();
})();
