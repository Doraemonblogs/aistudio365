# Scan-to-pay cashier

Fee-free checkout with your personal WeChat / Alipay 收款码, plugged into Dujiao-Next as two
易支付 channels (支付宝扫码, 微信扫码) whose gateway is `https://aistudio365.duckdns.org/cashier/`.
When a buyer pays, Dujiao-Next redirects to `/cashier/submit.php?type=..&money=..&name=<order no>`,
which nginx serves as the static `index.html`: order number, amount, your QR code and the
"截图 + 订单号 发客服微信 aistudio361" steps. No third party is involved and nothing is
confirmed automatically.

## Daily flow for customer service

1. Buyer sends a payment screenshot and order number on WeChat.
2. Check the money in your own WeChat/Alipay bill (amount and time), not just the screenshot.
3. Admin → 订单 → open the order → 人工确认支付 → pick the payment record → 确认已收款并补单.
   Works even if the order already timed out (payment window is 60 minutes).
4. Do the top-up, then deliver the order in the admin. The buyer's order page now shows
   "已确认收款，客服正在为你办理".

## Files

- `index.html`: the cashier page.
- `qr/`: your 收款码 images (see `qr/README.md`).
- `setup.sh`: installs the page and QR images to `/var/www/aistudio365-cashier`, adds the
  nginx route, then runs `setup_db.py` (creates the two channels, disables other 易支付
  channels, sets the 60-minute payment window, rewrites post-payment instructions).

## Update the page or QR codes

```powershell
ssh root@23.246.154.136 "rm -rf /root/aistudio365-cashier"
scp -r cashier root@23.246.154.136:/root/aistudio365-cashier
ssh root@23.246.154.136 "cd /root/aistudio365-cashier && sed -i 's/\r$//' setup.sh setup_db.py && bash setup.sh"
```

Re-running is safe: existing channels and settings are kept, and setup_db.py only rewrites
the post-payment instructions.
