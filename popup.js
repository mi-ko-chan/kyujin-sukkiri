(async () => {
  "use strict";

  const VERSION = "5.6";
  const $ = selector => document.querySelector(selector);
  const saveStatus = $("#save-status");

  let poll;

  function timeout(promise, message) {
    let timer;

    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(message)),
          6000
        );
      })
    ]).finally(() => clearTimeout(timer));
  }

  try {
    const rules = globalThis.SESFilterRules;
    const enabled = $("#enabled");
    const settings = $("#settings");
    const words = $("#words");
    const pageStatus = $("#page-status");
    const showAll = $("#show-all");

    if (
      ![
        enabled,
        settings,
        words,
        pageStatus,
        showAll,
        saveStatus
      ].every(Boolean)
    ) {
      throw new Error(
        "popup.htmlに必要な項目がありません。"
      );
    }

    if (
      !Array.isArray(rules?.keywords) ||
      !Array.isArray(rules?.defaultIds) ||
      typeof rules?.normalizeSelection !== "function"
    ) {
      throw new Error(
        "rules.jsを読み込めません。ファイル名と内容を確認してください。"
      );
    }

    if (!globalThis.chrome?.storage?.local) {
      throw new Error(
        "ブラウザの拡張機能アイコンから設定を開いてください。"
      );
    }

    document.title = "求人すっきり";

    if ($("h1")) {
      $("h1").textContent = "求人すっきり";
    }

    if ($("header p")) {
      $("header p").textContent =
        "DODA・エン転職・マイナビ転職に対応";
    }

    const keys = {
      words: "sesFilterSelectedWordsV1",
      enabled: "sesFilterEnabledV1",
      location: "sesFilterStrictLocationV1",
      dispatch: "jobFilterDispatchV1",
      remote: "jobFilterFullRemoteV1"
    };

    let tabId;
    let temporary = false;
    let saving = false;
    let checking = false;

    function addOption(text) {
      const label = document.createElement("label");
      const input = document.createElement("input");

      input.type = "checkbox";

      label.append(
        input,
        document.createTextNode(text)
      );

      words.before(label);
      return input;
    }

    const locationOption = addOption(
      "勤務地が曖昧な求人を非表示"
    );

    const dispatchOption = addOption(
      "派遣を除外"
    );

    const remoteOption = addOption(
      "フルリモート・完全在宅を除外（可も含む）"
    );

    const note = document.createElement("p");
    note.className = "hint";
    note.textContent =
      "派遣の除外には、登録済み派遣会社の本社職も含みます。フルリモートの除外は初期設定でOFFです。";

    words.before(note);
    words.replaceChildren();

    const inputs = rules.keywords.map(word => {
      const label = document.createElement("label");
      const input = document.createElement("input");

      input.type = "checkbox";
      input.value = word.id;

      label.append(
        input,
        document.createTextNode(word.label)
      );

      words.append(label);
      return input;
    });

    function setSelection(ids) {
      const selected = rules.normalizeSelection(ids);

      inputs.forEach(input => {
        input.checked = selected.includes(input.value);
      });
    }

    async function loadSettings() {
      const saved = await timeout(
        chrome.storage.local.get(Object.values(keys)),
        "設定の読み込みがタイムアウトしました。設定を開き直してください。"
      );

      enabled.checked = saved[keys.enabled] !== false;
      locationOption.checked = saved[keys.location] !== false;
      dispatchOption.checked = saved[keys.dispatch] !== false;
      remoteOption.checked = saved[keys.remote] === true;

      setSelection(saved[keys.words]);
    }

    async function check(
      message = { type: "job-filter:status" }
    ) {
      if (checking) return;
      checking = true;

      try {
        if (tabId == null) {
          throw new Error(
            "対象タブを取得できません。"
          );
        }

        const stats = await timeout(
          chrome.tabs.sendMessage(
            tabId,
            message,
            { frameId: 0 }
          ),
          "求人ページから応答がありません。ページを再読み込みしてください。"
        );

        if (stats?.version !== VERSION) {
          throw new Error(
            "求人ページが旧版のままです。ページを再読み込みしてください。"
          );
        }

        if (stats.error) {
          throw new Error(stats.error);
        }

        temporary = Boolean(stats.showAll);

        pageStatus.textContent = stats.total
          ? (stats.site || "") + "：" +
            stats.total + "件を認識、" +
            stats.matched + "件が該当、" +
            stats.hidden + "件を非表示" +
            (
              !stats.enabled
                ? "（全体OFF）"
                : temporary
                  ? "（一時表示中）"
                  : ""
            ) +
            (
              stats.missingLocation
                ? "／勤務地を読めない求人：" +
                  stats.missingLocation + "件"
                : ""
            )
          : "求人カードを認識できません。DODA・エン転職・マイナビ転職の求人一覧を開いてください。";

        showAll.textContent = temporary
          ? "このページの一時表示を解除"
          : "このページだけ全件表示";

        showAll.disabled = !stats.total || !stats.enabled;
      } catch (error) {
        pageStatus.textContent =
          "ページの処理を確認できません。" +
          (
            /Receiving end|connection|port closed/i.test(
              error.message
            )
              ? "DODA・エン転職・マイナビ転職の求人一覧を再読み込みしてください。"
              : error.message
          );

        showAll.disabled = true;
      } finally {
        checking = false;
      }
    }

    async function save(values) {
      if (saving) return;

      saving = true;
      settings.disabled = true;
      enabled.disabled = true;
      saveStatus.textContent = "保存中…";

      let recovered = true;

      try {
        await timeout(
          chrome.storage.local.set(values),
          "保存の完了を確認できません。設定を開き直してください。"
        );

        saveStatus.textContent = "保存しました。";
      } catch (error) {
        saveStatus.textContent =
          error.message || "保存できませんでした。";

        try {
          await loadSettings();
        } catch {
          recovered = false;
        }
      } finally {
        saving = false;
        settings.disabled = !recovered;
        enabled.disabled = !recovered;
      }

      if (recovered) void check();
    }

    enabled.addEventListener("change", () => {
      save({
        [keys.enabled]: enabled.checked
      });
    });

    locationOption.addEventListener("change", () => {
      save({
        [keys.location]: locationOption.checked
      });
    });

    dispatchOption.addEventListener("change", () => {
      save({
        [keys.dispatch]: dispatchOption.checked
      });
    });

    remoteOption.addEventListener("change", () => {
      save({
        [keys.remote]: remoteOption.checked
      });
    });

    inputs.forEach(input => {
      input.addEventListener("change", () => {
        save({
          [keys.words]: inputs
            .filter(item => item.checked)
            .map(item => item.value)
        });
      });
    });

    document.querySelectorAll("[data-preset]")
      .forEach(button => {
        button.addEventListener("click", () => {
          const preset = button.dataset.preset;
          const on = preset !== "none";

          const ids = preset === "all"
            ? rules.keywords.map(word => word.id)
            : on
              ? rules.defaultIds
              : [];

          setSelection(ids);

          locationOption.checked = on;
          dispatchOption.checked = on;

          // 「初期設定」ではOFF。「すべて選択」時だけON。
          remoteOption.checked = preset === "all";

          save({
            [keys.words]: ids,
            [keys.location]: on,
            [keys.dispatch]: on,
            [keys.remote]: remoteOption.checked
          });
        });
      });

    showAll.addEventListener("click", () => {
      if (checking) return;

      showAll.disabled = true;

      void check({
        type: "job-filter:show-all",
        value: !temporary
      });
    });

    await loadSettings();

    settings.disabled = false;
    enabled.disabled = false;
    saveStatus.textContent = "変更は自動保存されます。";

    try {
      const tabs = await timeout(
        chrome.tabs.query({
          active: true,
          currentWindow: true
        }),
        "対象タブの取得がタイムアウトしました。"
      );

      tabId = tabs[0]?.id;
    } catch {}

    await check();

    poll = setInterval(() => {
      if (!saving) void check();
    }, 1500);

    window.addEventListener(
      "pagehide",
      () => clearInterval(poll),
      { once: true }
    );
  } catch (error) {
    clearInterval(poll);

    const message =
      "設定を開けません：" +
      (error.message || String(error));

    if (saveStatus) {
      saveStatus.textContent = message;
    } else {
      const notice = document.createElement("p");
      notice.textContent = message;

      (
        document.body ||
        document.documentElement
      ).append(notice);
    }

    for (const selector of [
      "#settings",
      "#enabled",
      "#show-all"
    ]) {
      if ($(selector)) {
        $(selector).disabled = true;
      }
    }
  }
})();