import { describe, expect, it } from 'bun:test';
import { collectProductCodesFromPaths, extractProductCodesFromPath } from './product-code';

describe('extractProductCodesFromPath', () => {
  it('extracts the product code from the style directory after the date path', () => {
    expect(
      extractProductCodesFromPath(
        '2026年/4月/0414/1.T8610416@柠檬水果印花_T/风格参考/官网图/T8610416@6.jpg'
      )
    ).toEqual(['T8610416']);
  });

  it('supports style directories without the numeric prefix', () => {
    expect(extractProductCodesFromPath('2026/04/14/T8610416@柠檬水果印花_T/官网图/1.jpg')).toEqual([
      'T8610416',
    ]);
  });

  it('falls back to other path segments when the style directory cannot be parsed', () => {
    expect(extractProductCodesFromPath('2026/04/14/风格参考/官网图/T8610416@6.jpg')).toEqual([
      'T8610416',
    ]);
  });

  it('returns an empty list when no recognizable product code exists', () => {
    expect(extractProductCodesFromPath('2026/04/14/风格参考/官网图/细节图.jpg')).toEqual([]);
  });

  it('keeps the product image code before the outfit image code', () => {
    expect(
      collectProductCodesFromPaths([
        '2026年/4月/0414/1.T8610416@柠檬水果印花_T/风格参考/官网图/T8610416@6.jpg',
        '2026年/4月/0414/2.T9990001@牛仔短裙/风格参考/官网图/T9990001@1.jpg',
      ])
    ).toEqual(['T8610416', 'T9990001']);
  });
});
