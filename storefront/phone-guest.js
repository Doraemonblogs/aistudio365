/*
 * Phone-only guest checkout for Dujiao-Next.
 *
 * Dujiao-Next requires a guest email + order password (>= 6 chars) for every guest order and
 * for guest order lookup. Wherever the storefront shows that pair (checkout, 游客查单, guest
 * order detail, payment page), this script hides both inputs and shows one 手机号 field instead.
 * A valid phone fills them in as  <phone>@aistudio365.phone  /  <phone>, so the same phone
 * always finds the same orders, and the admin order list shows the phone in the guest email.
 *
 * The guest inputs are matched by the 订单密码 placeholder, which only guest forms use.
 */
(function () {
  if (window.__aisPhoneGuest) return;
  window.__aisPhoneGuest = true;

  var DOMAIN = 'aistudio365.phone';
  var PHONE_RE = /^1\d{10}$/;
  var WECHAT_ID = 'aistudio361';

  var TEXT = {
    '购买方式': '联系方式',
    '填写说明：': '说明：',
    '邮箱：请填写一个可接收邮件的邮箱，您在付款后我们可通过该邮箱向您发送商品信息并可通过该邮箱联系您':
      '手机号：用于核对订单。付款后请添加客服微信 ' + WECHAT_ID + '，发送付款截图和订单号',
    '订单密码：请自行设置一个复杂密码并妥善保管，该密码用于您在购买之后，通过“游客查单”菜单，查询您所购买的商品':
      '查单：之后在「游客查单」输入同一个手机号即可查看订单',
    '请输入邮箱与订单密码': '请输入 11 位手机号',
    '请填写邮箱与订单密码': '请输入 11 位手机号',
    '订单密码至少 6 位': '请输入 11 位手机号',
    '请先登录或使用游客购买': '请输入 11 位手机号',
    '输入邮箱与订单密码查看历史订单': '输入下单时填写的手机号查看订单',
    '请输入下单时的邮箱与订单密码': '请输入下单时填写的手机号',
    '请填写下单时的邮箱与订单密码': '请输入下单时填写的手机号',
    '补录游客凭据': '输入下单手机号',
    '补录订单凭据': '输入下单手机号'
  };
  var SAVED_RE = /^(\s*)已保存邮箱：(\d{11})@aistudio365\.phone(\s*)$/;

  function digits(value) {
    var d = String(value || '').replace(/\D/g, '');
    if (d.length === 13 && d.indexOf('86') === 0) d = d.slice(2);
    return d;
  }

  function phoneFromEmail(value) {
    var m = /^(\d{11})@aistudio365\.phone$/i.exec(String(value || '').trim());
    return m ? m[1] : '';
  }

  function setValue(input, value) {
    if (!input || input.value === value) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function sync(phone) {
    var p = digits(phone.value);
    var ok = PHONE_RE.test(p);
    setValue(phone._aisEmail, ok ? p + '@' + DOMAIN : '');
    setValue(phone._aisPassword, ok ? p : '');
    return ok;
  }

  function enhance(pw) {
    if (pw.getAttribute('data-ais-done')) return;
    var scope = pw.parentElement;
    var email = scope && scope.querySelector('input[type="email"]');
    if (!email) return;
    pw.setAttribute('data-ais-done', '1');

    var phone = document.createElement('input');
    phone.type = 'tel';
    phone.inputMode = 'numeric';
    phone.autocomplete = 'tel';
    phone.maxLength = 16;
    phone.placeholder = '手机号（11 位）';
    phone.className = email.className;
    phone.setAttribute('data-ais-phone', '1');
    if ((email.placeholder || '').indexOf('用于查询订单') !== -1) phone.style.gridColumn = '1 / -1';
    phone._aisEmail = email;
    phone._aisPassword = pw;

    email.setAttribute('autocomplete', 'off');
    pw.setAttribute('autocomplete', 'new-password');
    email.style.display = 'none';
    pw.style.display = 'none';
    scope.insertBefore(phone, email);

    phone.value = phoneFromEmail(email.value);
    sync(phone); // also clears any non-phone credentials left from before

    phone.addEventListener('input', function () {
      phone.style.borderColor = '';
      sync(phone);
    });
    phone.addEventListener('blur', function () {
      if (phone.value && !sync(phone)) phone.style.borderColor = '#ef4444';
    });
  }

  function rewriteText() {
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      if (!raw || raw.length > 200) continue;
      var key = raw.trim();
      if (Object.prototype.hasOwnProperty.call(TEXT, key)) {
        node.nodeValue = raw.replace(key, TEXT[key]);
      } else if (SAVED_RE.test(raw)) {
        node.nodeValue = raw.replace(SAVED_RE, '$1已保存手机号：$2$3');
      }
    }
  }

  function scan() {
    var inputs = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < inputs.length; i++) {
      if ((inputs[i].getAttribute('placeholder') || '') === '订单密码') enhance(inputs[i]);
    }
    rewriteText();
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; scan(); }, 30);
  }

  // Re-apply the phone right before any button press, in case a browser autofill touched the
  // hidden fields after the buyer typed.
  document.addEventListener('click', function () {
    var phones = document.querySelectorAll('input[data-ais-phone]');
    for (var i = 0; i < phones.length; i++) {
      if (phones[i].isConnected && phones[i]._aisEmail && phones[i]._aisEmail.isConnected) sync(phones[i]);
    }
  }, true);

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
})();
