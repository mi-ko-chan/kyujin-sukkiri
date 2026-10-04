(() => {
  "use strict";

  const isDoda = location.hostname === "doda.jp";
  const isMynavi = location.hostname === "tenshoku.mynavi.jp";

  if (
    !isDoda &&
    !isMynavi &&
    location.hostname !== "employment.en-japan.com"
  ) {
    return;
  }

  const VERSION = "5.6";

  const siteName = isDoda
    ? "DODA"
    : isMynavi
      ? "マイナビ転職"
      : "エン転職";

  const mynaviSelector =
    ".cassetteRecruit, .cassetteRecruitRecommend, .recruit > .box";

  const unitSelector = isDoda
    ? ".jobCard-card"
    : isMynavi
      ? mynaviSelector
      : ".jobSearchListUnit";

  const listSelector = isDoda
    ? ".searchJobList__jobList .jobCard-card"
    : unitSelector;

  const titleSelector = isDoda
    ? ".jobCard-header__link h2"
    : isMynavi
      ? ".cassetteRecruit__copy a, .cassetteRecruitRecommend__copy a, .recruit_title .sub_title a"
      : ".jobNameText, .jobNameArea";

  if (globalThis.__jobFilterVersion === VERSION) return;
  globalThis.__jobFilterVersion = VERSION;

  const rules = globalThis.SESFilterRules;

  const keys = {
    words: "sesFilterSelectedWordsV1",
    enabled: "sesFilterEnabledV1",
    location: "sesFilterStrictLocationV1",
    dispatch: "jobFilterDispatchV1",
    remote: "jobFilterFullRemoteV1"
  };

  let config = {
    enabled: true,
    location: true,
    dispatch: true,
    remote: false,
    words: []
  };

  let showAll = false;
  let ready = false;
  let timer;

  let status = {
    version: VERSION,
    total: 0,
    matched: 0,
    hidden: 0
  };

  const changed = new Map();

  const staffingCompanies = [
    "株式会社ウィルオブ・ワーク",
    "株式会社スタッフサービス",
    "パーソルテンプスタッフ株式会社",
    "株式会社リクルートスタッフィング",
    "アデコ株式会社",
    "株式会社パソナ",
    "ランスタッド株式会社",
    "マンパワーグループ株式会社",
    "株式会社コントラフト",
    "パーソルエクセルHRパートナーズ株式会社",
    "株式会社綜合キャリアオプション",
    "株式会社テクノ・サービス",
    "株式会社ワールドコーポレーション",
    "株式会社アーキ・ジャパン",
    "株式会社BREXA Next",
    "株式会社BREXA Avance",
    "株式会社BREXA Technology",
    "株式会社BREXA Communications",
    "株式会社BREXA Engineering",
    "株式会社BREXA Advan",
    "株式会社BREXA SOLVIA",
    "株式会社BREXA Prime",
    "UTエイム株式会社",
    "UTエージェント株式会社",
    "UTスリーエム株式会社",
    "トゥエンティファースト株式会社",
    "UT東芝株式会社",
    "FJUTプラス株式会社",
    "UTハイテス株式会社",
    "株式会社アヴァンティスタッフ",
    "株式会社ヒューテック",
    "エムシーパートナーズ株式会社",
    "パーソルメディアスイッチ株式会社",
    "パーソルクロステクノロジー株式会社",
    "株式会社テクノプロ",
    "株式会社メイテック",
    "株式会社メイテックフィルダーズ",
    "株式会社メイテックEX",
    "株式会社フルキャスト",
    "日研トータルソーシング株式会社",
    "株式会社エイジェック",
    "株式会社ウィルエージェンシー",
    "株式会社ルフト・メディカルケア",
    "株式会社G&G",
    "株式会社日本ケイテム"
  ];

  function normalizeCompany(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/\(株\)/g, "株式会社")
      .replace(/\s+/g, "")
      .replace(/[・･]/g, "")
      .replace(/(?:\([^()]*\)|【[^【】]*】)+$/g, "")
      .toLowerCase();
  }

  const companyNames = new Set(
    staffingCompanies.map(normalizeCompany)
  );

  function isStaffingCompany(companyText) {
    const name = normalizeCompany(companyText);

    if (companyNames.has(name)) return true;

    for (const company of companyNames) {
      if (!name.startsWith(company)) continue;

      const suffix = name
        .slice(company.length)
        .replace(/^[\/／:：|｜-]+/, "");

      if (/株式会社|有限会社|合同会社/.test(suffix)) {
        continue;
      }

      if (
        /^テクノプロ(?:it|デザイン|エンジニアリング|r&d)社$/.test(
          suffix
        )
      ) {
        return true;
      }

      if (
        /^[a-z0-9一-龥ぁ-んァ-ヶー&]{1,30}(?:事業部|事業本部|支店|営業所)$/.test(
          suffix
        )
      ) {
        return true;
      }
    }

    return false;
  }

  function remoteInfo(value) {
    const text = String(value ?? "").normalize("NFKC");

    const pattern =
      /フルリモ(?:ート)?|完全(?:在宅|リモート)|100%在宅|出社(?:は)?(?:一切)?(?:不要|なし)/g;

    let mentioned = false;
    let definite = false;

    for (const match of text.matchAll(pattern)) {
      const before = text.slice(
        Math.max(0, match.index - 12),
        match.index
      );

      const after = text.slice(
        match.index + match[0].length
      );

      const negative =
        /^(?:勤務|ワーク|制度|は|が|に|の|も|\s)*(?:不可|不可能|非対応|対象外|では(?:ない|なく|ありません|ございません)|じゃ(?:ない|ありません)|なし|無し|できません|対応していません)/;

      if (
        negative.test(after) ||
        /(?:非|脱)\s*$/.test(before)
      ) {
        continue;
      }

      mentioned = true;

      const conditional =
        /^(?:勤務|ワーク|案件|制度|も|が|は|に|で|の|を|\s)*(?:可|可能|あり|有|相談|選択|希望|目指|対応)/.test(
          after
        ) ||
        /(?:原則|基本|一部|最大)\s*$/.test(before);

      if (!conditional) definite = true;
    }

    const mixed =
      /または|もしくは|いずれか|案件によ|配属先によ|出社.{0,12}(?:あり|有り|必要|必須)|(?:週|月|年)\s*[1-9一二三四五六七八九].{0,12}出社|出社.{0,12}(?:週|月|年)\s*[1-9一二三四五六七八九]|(?:研修|試用).{0,15}出社/;

    return {
      mentioned,
      definite: definite && !mixed.test(text)
    };
  }

  function mentionsFullRemote(value) {
    return remoteInfo(value).mentioned;
  }

  function restore(card) {
    const original = changed.get(card);
    if (!original) return;

    if (original.value) {
      card.style.setProperty(
        "display",
        original.value,
        original.priority
      );
    } else {
      card.style.removeProperty("display");
    }

    card.classList.remove("ses-filter-hidden");
    card.removeAttribute("data-ses-filter-reasons");
    changed.delete(card);
  }

  function readLocation(unit) {
    const rows = [
      ...unit.querySelectorAll(".dataList .data")
    ];

    const row = rows.find(item =>
      item.querySelector(".item")
        ?.textContent.replace(/\s+/g, "") === "勤務地"
    );

    if (row) {
      return row.querySelector(".text")
        ?.textContent.trim() ?? "";
    }

    const text = unit.innerText || unit.textContent || "";

    return text.match(
      /勤務地[：:\s]*([\s\S]*?)(?=\n\s*(?:エン転職|取材|気になる|詳細へ|応募資格|給与|仕事内容)|$)/
    )?.[1]?.trim() ?? "";
  }

  function getLocationReasons(value) {
    let text = String(value ?? "")
      .normalize("NFKC")
      .replace(/[‐‑‒–—―−－]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return ["勤務地の記載を確認できない"];
    }

    if (remoteInfo(text).definite) return [];

    text = text
      .replace(
        /全国(?:への|での|の)?転勤(?:は|が)?(?:一切)?(?:なし|無し|ありません|ございません)/g,
        ""
      )
      .replace(
        /(?:客先|顧客先|お客様先|クライアント先)(?:への|での|で)?(?:常駐|勤務)(?:は|が)?(?:一切)?(?:なし|無し|ありません|ございません)/g,
        ""
      );

    const variable =
      /案件先|契約先|複数|プロジェクト先|クライアント先|顧客先|客先|お客様先|派遣先|配属先|就業先|全国|各地|各拠点|各事業所|各店舗|各支店|各支社|首都圏|関東一円|関西一円|都内|府内|県内|市内|エリア|いずれか|または|もしくは|希望.{0,10}(?:考慮|配属|勤務地)|勤務地.{0,8}(?:選択|相談|決定)/;

    if (variable.test(text)) {
      return ["勤務地が広域・配属先次第"];
    }

    const address =
      /(?:都|道|府|県|市|区|町|村)[^\s、。／/()（）]{1,35}\d+(?:丁目|番地|番|号|[-－ー]\d+)/;

    if (address.test(text)) return [];

    const facilities = text.matchAll(
      /([^\s、。／/()（）:：]{2,30})(ビル|タワー|病院|ホテル|工場)/g
    );

    for (const match of facilities) {
      const name = match[1];

      const generic =
        /(?:本社|本店|支社|支店|自社|当社|弊社|勤務先|指定|提携|取引先|お客様|関連会社|グループ会社)(?:の)?$/;

      if (!generic.test(name)) return [];
    }

    return ["具体的な勤務場所を確認できない"];
  }

  function readJob(unit) {
    if (isMynavi) {
      const engineer = unit.matches(".recruit > .box");

      const nameSelector = engineer
        ? ".recruit_title .main_title"
        : ".cassetteRecruit__name, .cassetteRecruitRecommend__name";

      const nameText =
        unit.querySelector(nameSelector)?.textContent.trim() ?? "";

      // マイナビは「会社名 | 紹介文」という表記。
      const parts = nameText.split(/[|｜]/);
      const company = parts.shift()?.trim() ?? "";

      const title =
        unit.querySelector(
          engineer
            ? ".recruit_title .sub_title a"
            : ".cassetteRecruit__copy a, .cassetteRecruitRecommend__copy a"
        )?.textContent.trim() ?? "";

      const rows = [
        ...unit.querySelectorAll(
          engineer
            ? ".detaile_table tr"
            : ".tableCondition tr"
        )
      ];

      const locationRow = rows.find(row =>
        row.querySelector("th")
          ?.textContent.replace(/\s+/g, "") === "勤務地"
      );

      return {
        card: unit,
        company,
        title,

        workplace:
          locationRow?.querySelector("td")
            ?.textContent.trim() ?? "",

        employment:
          [...unit.querySelectorAll(
            engineer
              ? ".label_list .head_label"
              : ".labelEmploymentStatus"
          )]
            .map(node => node.textContent ?? "")
            .join(" "),

        text: [
          title,
          parts.join(" "),
          ...rows.map(row =>
            row.querySelector("td")?.textContent ?? ""
          ),
          ...[...unit.querySelectorAll(
            ".cassetteRecruit__point, .cassetteRecruitRecommend__point"
          )].map(node => node.textContent ?? "")
        ].join("\n")
      };
    }

    if (isDoda) {
      const rows = [
        ...unit.querySelectorAll(".jobCard-info")
      ];

      const row = rows.find(item =>
        item.querySelector("dt")
          ?.textContent.replace(/\s+/g, "") === "勤務地"
      );

      const title =
        unit.querySelector(".jobCard-header__link > p")
          ?.textContent ?? "";

      return {
        card: unit,

        company:
          unit.querySelector(".jobCard-header__link h2")
            ?.textContent ?? "",

        title,

        workplace:
          row?.querySelector("dd")?.textContent.trim() ?? "",

        employment:
          unit.querySelector(".jobCard-header__Tag")
            ?.textContent ?? "",

        text:
          title + "\n" +
          (unit.querySelector(".jobCard-body")?.textContent ?? "")
      };
    }

    const wrapper = unit.closest(".list");

    return {
      card:
        wrapper &&
        wrapper.querySelectorAll(".jobSearchListUnit").length === 1
          ? wrapper
          : unit,

      company:
        (
          unit.querySelector(".companyName .company") ||
          unit.querySelector(".companyName")
        )?.textContent ?? "",

      title:
        unit.querySelector(".jobNameText")?.textContent ?? "",

      workplace: readLocation(unit),

      employment:
        [...unit.querySelectorAll(".listTitleMark--employ")]
          .map(node => node.textContent ?? "")
          .join(" ") ||
        unit.querySelector(".listTitleMark")?.textContent ||
        "",

      text:
        [...unit.querySelectorAll(
          ".jobNameText, .catchArea .catch, .catchArea .text, .dataList .data .text, .writerArea .comment"
        )]
          .map(node => node.textContent ?? "")
          .join("\n")
    };
  }

  function apply() {
    if (!ready) return;

    const units = [
      ...document.querySelectorAll(listSelector)
    ].filter(unit => unit.querySelector(titleSelector));

    const active = new Set();

    const next = {
      version: VERSION,
      site: siteName,
      total: units.length,
      matched: 0,
      hidden: 0,
      missingLocation: 0,
      enabled: config.enabled,
      showAll,
      error: ""
    };

    for (const unit of units) {
      const job = readJob(unit);
      const card = job.card;

      active.add(card);

      const reasons = rules.getReasons(
        job.text,
        config.words
      );

      if (config.dispatch) {
        if (/派遣/.test(job.employment.normalize("NFKC"))) {
          reasons.push("雇用形態に派遣の記載");
        }

        if (isStaffingCompany(job.company)) {
          reasons.push("登録済み派遣会社");
        }
      }

      if (
        config.remote &&
        mentionsFullRemote(job.title + "\n" + job.workplace)
      ) {
        reasons.push("フルリモート・完全在宅");
      }

      if (!job.workplace) next.missingLocation++;

      if (config.location) {
        reasons.push(
          ...getLocationReasons(job.workplace)
        );
      }

      if (reasons.length) next.matched++;

      if (reasons.length && config.enabled && !showAll) {
        if (!changed.has(card)) {
          changed.set(card, {
            value: card.style.getPropertyValue("display"),
            priority: card.style.getPropertyPriority("display")
          });
        }

        card.style.setProperty(
          "display",
          "none",
          "important"
        );

        card.setAttribute(
          "data-ses-filter-reasons",
          reasons.join("、")
        );

        if (getComputedStyle(card).display === "none") {
          next.hidden++;
        }
      } else {
        restore(card);
      }
    }

    for (const card of [...changed.keys()]) {
      if (!active.has(card)) restore(card);
    }

    status = next;
    return status;
  }

  async function refresh() {
    try {
      if (!rules?.getReasons || !rules?.normalizeSelection) {
        throw new Error(
          "rules.jsを読み込めません。拡張機能と求人ページを再読み込みしてください。"
        );
      }

      const saved = await chrome.storage.local.get(
        Object.values(keys)
      );

      config = {
        enabled: saved[keys.enabled] !== false,
        location: saved[keys.location] !== false,
        dispatch: saved[keys.dispatch] !== false,
        remote: saved[keys.remote] === true,
        words: rules.normalizeSelection(saved[keys.words])
      };

      ready = true;
      return apply();
    } catch (error) {
      for (const card of [...changed.keys()]) {
        restore(card);
      }

      status = {
        ...status,
        version: VERSION,
        hidden: 0,
        error: String(error.message || error)
      };

      return status;
    }
  }

  chrome.runtime.onMessage.addListener(
    (message, sender, respond) => {
      if (sender.id !== chrome.runtime.id) return;

      if (
        ![
          "job-filter:status",
          "job-filter:show-all"
        ].includes(message?.type)
      ) {
        return;
      }

      if (
        message.type === "job-filter:show-all" &&
        typeof message.value === "boolean"
      ) {
        showAll = message.value;
      }

      refresh().then(respond);
      return true;
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      Object.values(keys).some(key => key in changes)
    ) {
      refresh();
    }
  });

  new MutationObserver(records => {
    const relevant = records.some(record => {
      const element =
        record.target.nodeType === 1
          ? record.target
          : record.target.parentElement;

      return (
        element?.closest(unitSelector) ||
        [
          ...record.addedNodes,
          ...record.removedNodes
        ].some(node =>
          node.nodeType === 1 &&
          (
            node.matches(unitSelector) ||
            node.querySelector(unitSelector)
          )
        )
      );
    });

    if (!relevant) return;

    clearTimeout(timer);
    timer = setTimeout(() => refresh(), 150);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  refresh();
})();