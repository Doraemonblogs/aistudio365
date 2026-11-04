# Payment QR codes

Put your personal 收款码 images here, then run `setup.sh` again (see ../README.md).

| File | Used for |
| --- | --- |
| `wechat.png` | 微信扫码, any amount (buyer types the amount) |
| `alipay.png` | 支付宝扫码, any amount |
| `wechat-125.00.png`, `alipay-125.00.png`, … | Optional fixed-amount codes; picked automatically when the order total matches |

`.jpg` and `.webp` work too. Amounts always have two decimals (`28.00`, `1198.00`).
