(() => {
  "use strict";

  const sites = Object.freeze({
    "doda.jp": Object.freeze({
      name: "DODA",
      cardSelector: ""
    }),

    "employment.en-japan.com": Object.freeze({
      name: "エン転職",
      listSelector: ".jobSearchListLeftArea",
      cardSelector: ".jobSearchListLeftArea > .list",
      unitSelector: ".jobSearchListUnit",
      textSelector:
        ".jobNameText, .catchArea .catch, .catchArea .text, .dataList .data .text, .writerArea .comment"
    }),

    "tenshoku.mynavi.jp": Object.freeze({
      name: "マイナビ転職",
      cardSelector: ""
    })
  });

  const keywords = Object.freeze([
    {
      id: "ses",
      label: "SES",
      pattern: /(?<![a-z])SES(?![a-z])/gi,
      defaultOn: true
    },
    {
      id: "ses-full",
      label: "システムエンジニアリングサービス",
      pattern: /システム[・\s]*エンジニアリング[・\s]*サービス/gi,
      defaultOn: true
    },
    {
      id: "onsite",
      label: "客先常駐・顧客先常駐など",
      pattern: /(?:客先|顧客先|お客様先|クライアント先)(?:での|で|への|に)?\s*常駐/gi,
      defaultOn: true
    },
    {
      id: "project",
      label: "プロジェクト先",
      pattern: /プロジェクト先/gi,
      defaultOn: true
    },
    {
      id: "choice",
      label: "案件選択",
      pattern: /案件(?:の)?選択|案件(?:を|は)(?:自由に|自分で)?選(?:択|べ|ぶ|び)/gi,
      defaultOn: true
    },
    {
      id: "rate",
      label: "還元率",
      pattern: /還元率/gi,
      defaultOn: true
    },
    {
      id: "client",
      label: "クライアント先",
      pattern: /クライアント先/gi
    },
    {
      id: "customer",
      label: "客先・顧客先・お客様先",
      pattern: /お客様先|顧客先|客先/gi
    },
    {
      id: "onsite-work",
      label: "常駐勤務・常駐案件",
      pattern: /常駐(?:勤務|案件)/gi
    },
    {
      id: "high-return",
      label: "高還元",
      pattern: /高還元/gi
    },
    {
      id: "unit-pay",
      label: "単価連動",
      pattern: /単価連動/gi
    },
    {
      id: "unit-price",
      label: "案件単価",
      pattern: /案件単価/gi
    },
    {
      id: "open-price",
      label: "単価公開",
      pattern: /単価(?:を)?公開/gi
    },
    {
      id: "return-day",
      label: "帰社日（なし・ゼロも含む）",
      pattern: /帰社日/gi,
      includeNegative: true
    },
    {
      id: "assign",
      label: "アサイン（なしも含む）",
      pattern: /アサイン/gi,
      includeNegative: true
    },
    {
      id: "salary",
      label: "前給保証・前職給与保証",
      pattern: /前給保証|前職(?:の)?給与保証/gi
    },
    {
      id: "desired",
      label: "希望案件",
      pattern: /希望(?:の)?案件/gi
    }
  ].map(Object.freeze));

  const defaultIds = Object.freeze(
    keywords
      .filter(word => word.defaultOn)
      .map(word => word.id)
  );

  function normalizeSelection(ids) {
    if (!Array.isArray(ids)) {
      return [...defaultIds];
    }

    return keywords
      .filter(word => ids.includes(word.id))
      .map(word => word.id);
  }

  function getReasons(cardText, selectedIds = defaultIds) {
    const text = String(cardText ?? "").normalize("NFKC");
    const reasons = new Set();

    const selected = new Set(
      normalizeSelection(selectedIds)
    );

    for (const word of keywords) {
      if (!selected.has(word.id)) continue;

      for (const sentence of text.split(/[。！？!?\n\r]/)) {
        for (const match of sentence.matchAll(word.pattern)) {
          const before = sentence.slice(0, match.index);

          const after = sentence.slice(
            match.index + match[0].length
          );

          // 「SESなし」などの否定表現を除外。
          const negative =
            /^(?:[\s「」『』【】()（）:：・、=／/]|は|が|を|の|に|一切|原則|全く|完全に|絶対に|もう|事業|業務|勤務|案件|契約|形態|という働き方)*(?:なし|無し|ナシ|ない|無い|ありません|ございません|ゼロ|0(?:件|%|パーセント)|行いません|行わない|しません|しない|不要|禁止|ではなく|ではない|ではありません|から(?:の)?(?:卒業|脱却)|卒業|脱却)/i.test(
              after
            );

          // 過去の職歴についての記載を除外。
          const historical =
            /(?:前職|以前|過去|かつて)[^、。！？\n]{0,24}$/.test(
              before
            ) ||
            /^(?:での|の)?(?:経験|出身)|^(?:営業)?出身/.test(
              after
            );

          const prefixNegative =
            /(?:脱|非)\s*[「『【]?\s*$/.test(before);

          if (
            !word.includeNegative &&
            (negative || historical || prefixNegative)
          ) {
            continue;
          }

          reasons.add(word.label);
        }
      }
    }

    return [...reasons];
  }

  function shouldHideCard(cardText, selectedIds) {
    return getReasons(cardText, selectedIds).length > 0;
  }

  globalThis.SESFilterRules = Object.freeze({
    sites,
    keywords,
    defaultIds,
    normalizeSelection,
    getReasons,
    shouldHideCard
  });
})();