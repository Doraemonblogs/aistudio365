import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from '../web/src/admin/markdown.js';

// What a product imported from Dujiao-Next looks like in the database.
const IMPORTED =
  '<p>⚡ 【质保】Plus · 充值一个月</p><p>🚀 充到 <strong>你自己的账号</strong></p>' +
  '<p>🚀 下单后，约 <strong>5 分钟</strong>到账，充好会通知你</p>' +
  '<p><span style="color: rgb(51, 51, 51); font-size: 13px;">订阅后可免邦卡过学生认证4个月，已测试</span></p>';

describe('markdown editing', () => {
  it('opens stored HTML as readable Markdown', () => {
    expect(htmlToMarkdown(IMPORTED)).toBe(
      '⚡ 【质保】Plus · 充值一个月\n\n🚀 充到 **你自己的账号**\n\n🚀 下单后，约 **5 分钟**到账，充好会通知你\n\n订阅后可免邦卡过学生认证4个月，已测试',
    );
  });

  it('turns that Markdown back into the same paragraphs', () => {
    const html = markdownToHtml(htmlToMarkdown(IMPORTED)).replace(/\n/g, '');
    expect(html).toBe(
      '<p>⚡ 【质保】Plus · 充值一个月</p><p>🚀 充到 <strong>你自己的账号</strong></p>' +
        '<p>🚀 下单后，约 <strong>5 分钟</strong>到账，充好会通知你</p><p>订阅后可免邦卡过学生认证4个月，已测试</p>',
    );
  });

  it('keeps single line breaks and renders lists, headings and links', () => {
    expect(markdownToHtml('第一行\n第二行')).toBe('<p>第一行<br>第二行</p>');
    expect(markdownToHtml('### 注意\n- 一\n- 二').replace(/\n/g, '')).toBe('<h3>注意</h3><ul><li>一</li><li>二</li></ul>');
    expect(markdownToHtml('[官网](https://example.com)')).toBe('<p><a href="https://example.com">官网</a></p>');
    expect(htmlToMarkdown('<p>a<br>b</p>')).toBe('a\nb');
  });

  it('treats empty content as empty', () => {
    expect(markdownToHtml('  \n ')).toBe('');
    expect(htmlToMarkdown('')).toBe('');
  });
});
