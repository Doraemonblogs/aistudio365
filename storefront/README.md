# Storefront tweaks

Two entries in 后台 → 站点设置 → 自定义脚本, kept here so they can be edited and reinstalled.

| Entry | File | What it does |
| --- | --- | --- |
| `hide-login-links` | `hide-login.css` | Hides every login entry point (navbar 登录, mobile 我的, checkout 登录会员购买) and the checkout 游客购买/登录 button row. Guest checkout is the default, so nothing else changes. |
| `phone-only-guest` | `phone-guest.js` | Replaces the guest email + order password pair with one 手机号 field on checkout, 游客查单, guest order detail and the payment page. |
| `guest-order-contact` | `order-contact.js` | Adds a 商家联系方式 card (QQ, WeChat, copy buttons, what to do after paying) to the bottom of the guest order detail page. |

The cashier's 我已付款，查看订单 button opens the guest order detail page (`/guest/orders/<order no>`):
order info, items, the delivery content customer service enters when delivering, the usage
instructions, and the contact card.

## How the phone-only checkout works

Dujiao-Next's backend requires a guest email and an order password (6+ characters) for every
guest order and for guest order lookup, and that can't be turned off. The script hides both
inputs and fills them from the phone the buyer types:

- email: `<phone>@aistudio365.phone`
- order password: `<phone>`

So the same phone always finds the same orders in 游客查单, and the admin order list shows
the buyer's phone in the guest email column (for example `13800138000@aistudio365.phone`).

Trade-off: anyone who knows a buyer's phone number can look up that buyer's orders, the same
as the old wzyp shop's phone-based order lookup. Keep sensitive delivery content (account
passwords, card codes) in WeChat rather than in the order's delivery text if that matters.

Orders placed before this change used a real email and order password; those still need the
original email/password and can't be found by phone.

## Reinstall after editing

```powershell
ssh root@23.246.154.136 "rm -rf /root/aistudio365-storefront"
scp -r storefront root@23.246.154.136:/root/aistudio365-storefront
ssh root@23.246.154.136 "cd /root/aistudio365-storefront && sed -i 's/\r$//' * && bash install.sh"
```

`install.py` backs up the database first, replaces the two entries by name and leaves any other
custom scripts alone. To turn a tweak off, disable it in the admin or delete its entry there.
